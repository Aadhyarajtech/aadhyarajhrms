import { Department, Designation, Holiday, Employee } from "@/db/models";
import { nowIso } from "@/db/connection";

function toApiDoc(doc: any) {
  if (!doc) return undefined;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

export async function listDepartments() {
  const departments = await Department.find({}).sort({ name: 1 }).lean();
  if (departments.length === 0) return [];

  const headIds = [...new Set(departments.map((d) => d.headId).filter(Boolean))] as string[];
  const [headcounts, heads] = await Promise.all([
    Employee.aggregate([
      { $match: { status: "ACTIVE" } },
      { $group: { _id: "$departmentId", count: { $sum: 1 } } },
    ]),
    Employee.find({ _id: { $in: headIds } }).lean(),
  ]);
  const countMap = new Map(headcounts.map((c) => [c._id, c.count]));
  const headMap = new Map(heads.map((h) => [h._id, h]));

  return departments.map((d) => {
    const head = d.headId ? headMap.get(d.headId) : undefined;
    return {
      id: d._id,
      ...d,
      headcount: countMap.get(d._id) ?? 0,
      headFirstName: head?.firstName ?? null,
      headLastName: head?.lastName ?? null,
    };
  });
}

export async function getDepartment(id: string) {
  const row = await Department.findById(id).lean();
  return toApiDoc(row);
}

export async function createDepartment(input: { name: string; code: string; description?: string; colorHex?: string }) {
  const doc = await Department.create({
    name: input.name,
    code: input.code.toUpperCase(),
    description: input.description ?? null,
    colorHex: input.colorHex ?? "#5B4FE5",
    createdAt: nowIso(),
  });
  return getDepartment(doc._id);
}

export async function updateDepartment(
  id: string,
  input: { name?: string; description?: string; colorHex?: string; headId?: string | null }
) {
  const current = await Department.findById(id).lean();
  if (!current) return undefined;
  await Department.updateOne(
    { _id: id },
    {
      $set: {
        name: input.name ?? current.name,
        description: input.description ?? current.description,
        colorHex: input.colorHex ?? current.colorHex,
        headId: input.headId === undefined ? current.headId : input.headId,
      },
    }
  );
  return getDepartment(id);
}

export async function listDesignations(departmentId?: string) {
  if (departmentId) {
    const rows = await Designation.find({ departmentId }).sort({ level: -1, title: 1 }).lean();
    return rows.map(toApiDoc);
  }
  const rows = await Designation.find({}).lean();
  const departmentIds = [...new Set(rows.map((r) => r.departmentId))];
  const departments = await Department.find({ _id: { $in: departmentIds } }).lean();
  const deptMap = new Map(departments.map((d) => [d._id, d]));

  return rows
    .map((r) => ({ id: r._id, ...r, departmentName: deptMap.get(r.departmentId)?.name ?? null }))
    .sort((a, b) => {
      const deptCompare = (a.departmentName ?? "").localeCompare(b.departmentName ?? "");
      if (deptCompare !== 0) return deptCompare;
      return b.level - a.level;
    });
}

export async function createDesignation(input: { title: string; level: number; departmentId: string }) {
  const doc = await Designation.create(input);
  return toApiDoc((await Designation.findById(doc._id).lean())!);
}

export async function listHolidays(year?: number) {
  const query = year ? { date: { $regex: `^${year}-` } } : {};
  const rows = await Holiday.find(query).sort({ date: 1 }).lean();
  return rows.map(toApiDoc);
}

export async function createHoliday(input: { name: string; date: string; isOptional?: boolean }) {
  const doc = await Holiday.create({
    name: input.name,
    date: input.date,
    isOptional: !!input.isOptional,
  });
  return toApiDoc((await Holiday.findById(doc._id).lean())!);
}

export async function deleteHoliday(id: string) {
  await Holiday.deleteOne({ _id: id });
}
