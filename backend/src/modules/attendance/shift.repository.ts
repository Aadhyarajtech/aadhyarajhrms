/**
 * Attendance shift configuration repository.
 *
 * Owns shift CRUD, department defaults, employee assignment and geofence
 * configuration. Attendance transaction/punch logic remains in the
 * attendance repository.
 */

import { Department, Employee, Shift } from "@/db/models";
import { nowIso } from "@/db/connection";

export interface ShiftGeofence {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface ShiftPayload {
  name: string;
  code?: string | null;
  startTime: string;
  endTime: string;
  standardHours: number;
  graceMinutes?: number;
  breakMinutes?: number;
  overtimeAfterHours?: number;
  departmentId?: string | null;
  employeeIds?: string[];
  geofence?: ShiftGeofence | null;
  isActive?: boolean;
}

function toApiRecord<T extends Record<string, any>>(doc: T | null | undefined) {
  if (!doc) return undefined;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

function validateId(value: string, field: string) {
  if (!value?.trim()) throw new Error(`${field} is required.`);
}

function validateTime(value: string, field: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    throw new Error(`${field} must use HH:mm format.`);
  }
  const [hours, minutes] = value.split(":").map(Number);
  if (hours > 23 || minutes > 59) throw new Error(`Invalid ${field}.`);
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function validateHours(value: number, field: string) {
  if (!Number.isFinite(value) || value <= 0 || value > 24) {
    throw new Error(`${field} must be between 0 and 24 hours.`);
  }
}

function validateNonNegative(value: number, field: string, max: number) {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`${field} must be between 0 and ${max}.`);
  }
}

function validateEmployeeIds(employeeIds: string[] | undefined) {
  if (employeeIds === undefined) return [];
  if (!Array.isArray(employeeIds))
    throw new Error("employeeIds must be an array.");
  const unique = [
    ...new Set(employeeIds.map((id) => id.trim()).filter(Boolean)),
  ];
  return unique;
}

function validateGeofence(geofence: ShiftGeofence | null | undefined) {
  if (geofence == null) return null;
  if (
    !Number.isFinite(geofence.latitude) ||
    geofence.latitude < -90 ||
    geofence.latitude > 90
  ) {
    throw new Error("Geofence latitude must be between -90 and 90.");
  }
  if (
    !Number.isFinite(geofence.longitude) ||
    geofence.longitude < -180 ||
    geofence.longitude > 180
  ) {
    throw new Error("Geofence longitude must be between -180 and 180.");
  }
  if (
    !Number.isFinite(geofence.radiusMeters) ||
    geofence.radiusMeters <= 0 ||
    geofence.radiusMeters > 100000
  ) {
    throw new Error("Geofence radius must be between 1 and 100000 meters.");
  }
  return {
    latitude: Number(geofence.latitude),
    longitude: Number(geofence.longitude),
    radiusMeters: Number(geofence.radiusMeters),
  };
}

function validateShiftHours(
  startTime: string,
  endTime: string,
  standardHours: number,
) {
  validateTime(startTime, "startTime");
  validateTime(endTime, "endTime");
  validateHours(standardHours, "standardHours");

  // Supports both same-day and overnight shifts. For a same-time shift,
  // standardHours is still the source of truth rather than creating a zero shift.
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const scheduled = end >= start ? end - start : 1440 - start + end;
  if (scheduled > 0 && standardHours > scheduled / 60) {
    throw new Error(
      "standardHours cannot exceed the scheduled shift duration.",
    );
  }
}

async function assertDepartmentExists(departmentId: string | null | undefined) {
  // null/undefined means the shift is organization-wide.
  if (departmentId === undefined || departmentId === null) return;

  validateId(departmentId, "departmentId");

  const department = await Department.findById(departmentId)
    .select("_id")
    .lean();

  if (!department) throw new Error("Department not found.");
}

async function assertEmployeesExist(employeeIds: string[]) {
  if (!employeeIds.length) return;
  const employees = await Employee.find({
    _id: { $in: employeeIds },
    isArchived: { $ne: true },
  })
    .select("_id")
    .lean();

  const found = new Set(employees.map((employee: any) => String(employee._id)));
  const missing = employeeIds.filter((id) => !found.has(String(id)));
  if (missing.length) {
    throw new Error(`Employee(s) not found: ${missing.join(", ")}.`);
  }
}

export async function createShift(payload: ShiftPayload) {
  const name = payload.name?.trim();
  if (!name) throw new Error("Shift name is required.");

  validateShiftHours(payload.startTime, payload.endTime, payload.standardHours);

  const graceMinutes = payload.graceMinutes ?? 15;
  const breakMinutes = payload.breakMinutes ?? 60;
  const overtimeAfterHours =
    payload.overtimeAfterHours ?? payload.standardHours;
  validateNonNegative(graceMinutes, "graceMinutes", 1440);
  validateNonNegative(breakMinutes, "breakMinutes", 1440);
  validateHours(overtimeAfterHours, "overtimeAfterHours");
  if (overtimeAfterHours < payload.standardHours) {
    throw new Error(
      "Overtime threshold cannot be lower than standard working hours.",
    );
  }

  const employeeIds = validateEmployeeIds(payload.employeeIds);
  const geofence = validateGeofence(payload.geofence);
  await assertDepartmentExists(payload.departmentId);
  await assertEmployeesExist(employeeIds);

  const code = payload.code?.trim() || `SHIFT-${Date.now()}`;
  if (code) {
    const duplicate = await Shift.findOne({ code }).select("_id").lean();
    if (duplicate) throw new Error("A shift with this code already exists.");
  }

  const now = nowIso();
  const created = await Shift.create({
    name,
    code,
    startTime: payload.startTime,
    endTime: payload.endTime,
    standardHours: payload.standardHours,
    graceMinutes,
    breakMinutes,
    overtimeAfterHours,
    departmentId: payload.departmentId || null,
    employeeIds: [],
    geofence,
    isActive: payload.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  });

  if (employeeIds.length) {
    await assignShiftToEmployees(String(created._id), employeeIds);
  }

  const saved = await Shift.findById(created._id).lean();
  return toApiRecord(saved);
}

export async function updateShift(id: string, payload: Partial<ShiftPayload>) {
  validateId(id, "Shift id");

  const existing = await Shift.findById(id).lean();
  if (!existing) throw new Error("Shift not found.");

  const updates: Record<string, unknown> = { updatedAt: nowIso() };

  if (payload.name !== undefined) {
    const name = payload.name?.trim();
    if (!name) throw new Error("Shift name is required.");
    updates.name = name;
  }
  if (payload.startTime !== undefined) {
    validateTime(payload.startTime, "startTime");
    updates.startTime = payload.startTime;
  }
  if (payload.endTime !== undefined) {
    validateTime(payload.endTime, "endTime");
    updates.endTime = payload.endTime;
  }
  if (payload.standardHours !== undefined) {
    validateHours(payload.standardHours, "standardHours");
    updates.standardHours = payload.standardHours;
  }

  const startTime = String(updates.startTime ?? existing.startTime);
  const endTime = String(updates.endTime ?? existing.endTime);
  const standardHours = Number(updates.standardHours ?? existing.standardHours);
  validateShiftHours(startTime, endTime, standardHours);

  if (payload.graceMinutes !== undefined) {
    validateNonNegative(payload.graceMinutes, "graceMinutes", 1440);
    updates.graceMinutes = payload.graceMinutes;
  }
  if (payload.breakMinutes !== undefined) {
    validateNonNegative(payload.breakMinutes, "breakMinutes", 1440);
    updates.breakMinutes = payload.breakMinutes;
  }
  if (payload.overtimeAfterHours !== undefined) {
    validateHours(payload.overtimeAfterHours, "overtimeAfterHours");
    if (payload.overtimeAfterHours < standardHours) {
      throw new Error(
        "Overtime threshold cannot be lower than standard working hours.",
      );
    }
    updates.overtimeAfterHours = payload.overtimeAfterHours;
  } else if (
    payload.standardHours !== undefined &&
    Number(existing.overtimeAfterHours) < standardHours
  ) {
    throw new Error(
      "standardHours cannot exceed the existing overtime threshold. Update overtimeAfterHours too.",
    );
  }
  if (payload.departmentId !== undefined) {
    await assertDepartmentExists(payload.departmentId);
    updates.departmentId = payload.departmentId || null;
  }
  if (payload.geofence !== undefined) {
    updates.geofence = validateGeofence(payload.geofence);
  }
  if (payload.isActive !== undefined)
    updates.isActive = Boolean(payload.isActive);

  if (payload.code !== undefined) {
    const code = payload.code?.trim() || existing.code;
    if (code !== existing.code) {
      const duplicate = await Shift.findOne({ code, _id: { $ne: id } })
        .select("_id")
        .lean();
      if (duplicate) throw new Error("A shift with this code already exists.");
    }
    updates.code = code;
  }

  let requestedEmployeeIds: string[] | undefined;
  if (payload.employeeIds !== undefined) {
    requestedEmployeeIds = validateEmployeeIds(payload.employeeIds);
    await assertEmployeesExist(requestedEmployeeIds);
    updates.employeeIds = requestedEmployeeIds;
  }

  const updated = await Shift.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true },
  ).lean();
  if (!updated) throw new Error("Shift not found.");

  if (requestedEmployeeIds !== undefined) {
    await assignShiftToEmployees(id, requestedEmployeeIds);
  }

  const saved = await Shift.findById(id).lean();
  return toApiRecord(saved);
}

export async function listShifts(includeInactive = false) {
  const query = includeInactive ? {} : { isActive: true };
  const rows = await Shift.find(query).sort({ name: 1, createdAt: 1 }).lean();
  return rows.map(toApiRecord);
}

export async function getShift(id: string) {
  validateId(id, "Shift id");
  const row = await Shift.findById(id).lean();
  return toApiRecord(row);
}

export async function getEmployeeShift(employeeId: string) {
  validateId(employeeId, "Employee id");

  const employee: any = await Employee.findById(employeeId)
    .select("shiftId departmentId isArchived status")
    .lean();

  if (!employee || employee.isArchived || employee.status !== "ACTIVE")
    return undefined;

  if (employee.shiftId) {
    const assigned = await Shift.findOne({
      _id: employee.shiftId,
      isActive: true,
    }).lean();
    if (assigned) return toApiRecord(assigned);
  }

  if (employee.departmentId) {
    const departmentShift = await Shift.findOne({
      departmentId: employee.departmentId,
      isActive: true,
    })
      .sort({ createdAt: 1 })
      .lean();
    if (departmentShift) return toApiRecord(departmentShift);
  }

  return undefined;
}

export async function assignShiftToEmployees(
  shiftId: string,
  employeeIds: string[],
) {
  validateId(shiftId, "Shift id");
  const shift = await Shift.findById(shiftId).lean();
  if (!shift) throw new Error("Shift not found.");
  if (shift.isActive === false)
    throw new Error("Cannot assign an inactive shift.");

  const ids = validateEmployeeIds(employeeIds);
  await assertEmployeesExist(ids);

  const currentShiftEmployeeIds = (shift.employeeIds ?? []).map((id: unknown) =>
    String(id),
  );
  const now = nowIso();

  // Employees removed from this shift must also lose their employee-side
  // shiftId. Only clear employees that still point to this shift so an
  // employee reassigned elsewhere is never accidentally unassigned.
  const removedEmployeeIds = currentShiftEmployeeIds.filter(
    (id) => !ids.includes(id),
  );
  if (removedEmployeeIds.length) {
    await Employee.updateMany(
      { _id: { $in: removedEmployeeIds }, shiftId },
      { $set: { shiftId: null, updatedAt: now } },
    );
  }

  // Remove these employees from every other shift first, preventing stale
  // reverse assignment arrays.
  if (ids.length) {
    await Shift.updateMany(
      { _id: { $ne: shiftId }, employeeIds: { $in: ids } },
      { $pull: { employeeIds: { $in: ids } }, $set: { updatedAt: now } },
    );

    await Employee.updateMany(
      { _id: { $in: ids } },
      { $set: { shiftId, updatedAt: now } },
    );
  }

  // Keep the shift's reverse assignment list synchronized with the supplied
  // set rather than accumulating stale employee IDs.
  await Shift.updateOne(
    { _id: shiftId },
    {
      $set: {
        employeeIds: ids,
        updatedAt: now,
      },
    },
  );

  // If no employees were supplied, explicitly clear the assignment field.
  if (!ids.length) {
    await Employee.updateMany(
      { shiftId },
      { $set: { shiftId: null, updatedAt: now } },
    );
  }

  const saved = await Shift.findById(shiftId).lean();
  return toApiRecord(saved);
}
