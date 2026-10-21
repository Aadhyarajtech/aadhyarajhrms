
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import { validate } from "@/middleware/validate";
import { AppError } from "@/utils/errors";
import { AuditLog, Employee } from "@/db/models";
import {
  BREAK_GLASS_FIELDS,
  BreakGlassRequest,
  type BreakGlassField,
} from "./break-glass.model";

export const breakGlassRouter = Router();

breakGlassRouter.use(authenticate);

const adminRoles = ["SUPER_ADMIN", "ADMIN"] as const;
const isAdmin = (role: string) => adminRoles.includes(role as (typeof adminRoles)[number]);

const requestedFieldsSchema = z.enum([
  "emergencyContactName",
  "emergencyContactPhone",
  "emergencyContactRelationship",
  "emergencyContactEmail",
  "medicalConditions",
  "bloodGroup",
  "insurancePolicyNumber",
  "employeeAadhaar",
  "employeePan",
  "employeeTan",
  "bankAccountNumber",
  "bankIfscCode",
  "bankBranch",
]);

const createRequestSchema = z.object({
  targetEmployeeId: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(10).max(1000),
  requestedFields: z.array(requestedFieldsSchema).min(1).max(13),
  durationMinutes: z.number().int().min(1).max(30),
});

const decisionSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

function nowIso() {
  return new Date().toISOString();
}

async function writeBreakGlassAudit(
  userId: string,
  action: string,
  requestId: string,
  targetEmployeeId: string,
  req: Parameters<typeof breakGlassRouter.get>[1] extends never
    ? never
    : any,
  metadata: Record<string, unknown> = {},
) {
  await AuditLog.create({
    userId,
    action,
    entity: "BreakGlassRequest",
    entityId: requestId,
    metadata: JSON.stringify({
      targetEmployeeId,
      ...metadata,
    }),
    ipAddress: req.ip || null,
    createdAt: nowIso(),
  });
}

function publicRequest(request: any) {
  return {
    id: String(request._id),
    requesterUserId: request.requesterUserId,
    requesterEmployeeId: request.requesterEmployeeId,
    targetEmployeeId: request.targetEmployeeId,
    reason: request.reason,
    requestedFields: request.requestedFields,
    durationMinutes: request.durationMinutes,
    status: request.status,
    approverUserId: request.approverUserId,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    approvedAt: request.approvedAt,
    expiresAt: request.expiresAt,
    revokedAt: request.revokedAt,
    decisionNote: request.decisionNote,
  };
}

// Submit an emergency access request.
breakGlassRouter.post(
  "/",
  validate(createRequestSchema),
  async (req, res, next) => {
    try {
      const actor = req.user!;
      const body = req.body;

      if (new Set(body.requestedFields).size !== body.requestedFields.length) {
        throw AppError.badRequest("Requested fields must be unique.");
      }

      const employee = await Employee.findById(body.targetEmployeeId).lean();
      if (!employee) throw AppError.notFound("Target employee not found.");

      const now = nowIso();
      const request = await BreakGlassRequest.create({
        requesterUserId: actor.userId,
        requesterEmployeeId: actor.employeeId ?? null,
        targetEmployeeId: String(employee._id),
        reason: body.reason,
        requestedFields: body.requestedFields as BreakGlassField[],
        durationMinutes: body.durationMinutes,
        status: "PENDING",
        approverUserId: null,
        createdAt: now,
        updatedAt: now,
        approvedAt: null,
        expiresAt: null,
        revokedAt: null,
        decisionNote: null,
      });

      try {
        await writeBreakGlassAudit(
          actor.userId,
          "BREAK_GLASS_REQUESTED",
          String(request._id),
          String(employee._id),
          req,
          {
            requestedFields: body.requestedFields,
            durationMinutes: body.durationMinutes,
          },
        );
      } catch (auditError) {
        await BreakGlassRequest.deleteOne({
          _id: request._id,
          status: "PENDING",
        });
        throw auditError;
      }

      res.status(201).json({ request: publicRequest(request) });
    } catch (err) {
      next(err);
    }
  },
);

// Admins can see all requests; other users see only their own.
breakGlassRouter.get("/", async (req, res, next) => {
  try {
    const actor = req.user!;
    const filter = isAdmin(actor.role)
      ? {}
      : { requesterUserId: actor.userId };

    const requests = await BreakGlassRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ requests: requests.map(publicRequest) });
  } catch (err) {
    next(err);
  }
});

// Approve a pending request. The requester cannot approve their own request.

breakGlassRouter.post(
  "/:id/approve",
  validate(decisionSchema),
  async (req, res, next) => {
    try {
      const actor = req.user!;
      if (!isAdmin(actor.role)) throw AppError.forbidden();

      const current = await BreakGlassRequest.findById(req.params.id);
      if (!current) throw AppError.notFound("Break-Glass request not found.");

      if (current.requesterUserId === actor.userId) {
        throw AppError.forbidden("You cannot approve your own request.");
      }

      if (current.status !== "PENDING") {
        throw AppError.conflict("Only pending requests can be approved.");
      }

      const now = new Date();
      const approvedAt = now.toISOString();
      const expiresAt = new Date(
        now.getTime() + current.durationMinutes * 60_000,
      ).toISOString();

      // Reserve the request. This state never grants data access.
      const reserved = await BreakGlassRequest.findOneAndUpdate(
        { _id: current._id, status: "PENDING" },
        {
          $set: {
            status: "APPROVAL_AUDIT_PENDING",
            updatedAt: approvedAt,
          },
        },
        { new: true },
      );

      if (!reserved) {
        throw AppError.conflict("The request was already processed.");
      }

      try {
        // Audit the authorization decision before activating the grant.
        await writeBreakGlassAudit(
          actor.userId,
          "BREAK_GLASS_APPROVAL_AUTHORIZED",
          String(current._id),
          current.targetEmployeeId,
          req,
          {
            requestedFields: current.requestedFields,
            durationMinutes: current.durationMinutes,
          },
        );
      } catch (auditError) {
        // Keep the request non-accessible if the audit cannot be saved.
        await BreakGlassRequest.updateOne(
          {
            _id: current._id,
            status: "APPROVAL_AUDIT_PENDING",
          },
          {
            $set: {
              status: "PENDING",
              updatedAt: nowIso(),
            },
          },
        );
        throw auditError;
      }

      // Activate only after the authorization audit succeeds.
      const updated = await BreakGlassRequest.findOneAndUpdate(
        {
          _id: current._id,
          status: "APPROVAL_AUDIT_PENDING",
        },
        {
          $set: {
            status: "APPROVED",
            approverUserId: actor.userId,
            approvedAt,
            expiresAt,
            updatedAt: approvedAt,
            decisionNote: req.body.note ?? null,
          },
        },
        { new: true },
      );

      if (!updated) {
        throw AppError.conflict(
          "The request could not be activated. Contact an administrator.",
        );
      }

      res.json({ request: publicRequest(updated) });
    } catch (err) {
      next(err);
    }
  },
);



// Reject a pending request.
breakGlassRouter.post(
  "/:id/reject",
  validate(decisionSchema),
  async (req, res, next) => {
    try {
      const actor = req.user!;
      if (!isAdmin(actor.role)) throw AppError.forbidden();

      const current = await BreakGlassRequest.findById(req.params.id);
      if (!current) {
        throw AppError.notFound("Break-Glass request not found.");
      }
      if (current.requesterUserId === actor.userId) {
        throw AppError.forbidden("You cannot reject your own request.");
      }
      if (current.status !== "PENDING") {
        throw AppError.conflict("Only pending requests can be rejected.");
      }

      const now = nowIso();

      // Reserve the request; this state never grants data access.
      const reserved = await BreakGlassRequest.findOneAndUpdate(
        { _id: current._id, status: "PENDING" },
        {
          $set: {
            status: "REJECTION_AUDIT_PENDING",
            updatedAt: now,
          },
        },
        { new: true },
      );

      if (!reserved) {
        throw AppError.conflict("The request was already processed.");
      }

      try {
        await writeBreakGlassAudit(
          actor.userId,
          "BREAK_GLASS_REJECTED",
          String(reserved._id),
          reserved.targetEmployeeId,
          req,
          {},
        );
      } catch (auditError) {
        // Restore pending only if this handler still owns the reservation.
        await BreakGlassRequest.updateOne(
          {
            _id: reserved._id,
            status: "REJECTION_AUDIT_PENDING",
            updatedAt: now,
          },
          {
            $set: {
              status: "PENDING",
              updatedAt: nowIso(),
            },
          },
        );
        throw auditError;
      }

      // Finalize only after the audit succeeds.
      const updated = await BreakGlassRequest.findOneAndUpdate(
        {
          _id: reserved._id,
          status: "REJECTION_AUDIT_PENDING",
          updatedAt: now,
        },
        {
          $set: {
            status: "REJECTED",
            approverUserId: actor.userId,
            updatedAt: nowIso(),
            decisionNote: req.body.note ?? null,
          },
        },
        { new: true },
      );

      if (!updated) {
        throw AppError.conflict(
          "The rejection was audited, but the request could not be finalized. Contact an administrator.",
        );
      }

      res.json({ request: publicRequest(updated) });
    } catch (err) {
      next(err);
    }
  },
);


// Revoke an approved request immediately.
breakGlassRouter.post("/:id/revoke", async (req, res, next) => {
  try {
    const actor = req.user!;
    if (!isAdmin(actor.role)) throw AppError.forbidden();

    const now = nowIso();
    const updated = await BreakGlassRequest.findOneAndUpdate(
      { _id: req.params.id, status: "APPROVED" },
      {
        $set: {
          status: "REVOKED",
          revokedAt: now,
          updatedAt: now,
        },
      },
      { new: true },
    );

    if (!updated) {
      throw AppError.conflict("No active approved request was found.");
    }

    // Revocation stays in force even if the audit store is unavailable.
    await writeBreakGlassAudit(
      actor.userId,
      "BREAK_GLASS_REVOKED",
      String(updated._id),
      updated.targetEmployeeId,
      req,
      { requestedFields: updated.requestedFields },
    );

    res.json({ request: publicRequest(updated) });
  } catch (err) {
    next(err);
  }
});

// Return only approved fields through this dedicated endpoint.
breakGlassRouter.get("/:id/data", async (req, res, next) => {
  try {
    const actor = req.user!;
    const grant = await BreakGlassRequest.findById(req.params.id);

    if (!grant) throw AppError.notFound("Break-Glass request not found.");
    if (grant.requesterUserId !== actor.userId) {
      throw AppError.forbidden("This grant does not belong to your account.");
    }

    const now = Date.now();

    if (
      grant.status !== "APPROVED" ||
      !grant.expiresAt ||
      new Date(grant.expiresAt).getTime() <= now ||
      grant.revokedAt
    ) {
      if (
        grant.status === "APPROVED" &&
        grant.expiresAt &&
        new Date(grant.expiresAt).getTime() <= now
      ) {
        await BreakGlassRequest.updateOne(
          { _id: grant._id, status: "APPROVED" },
          { $set: { status: "EXPIRED", updatedAt: nowIso() } },
        );
      }

      throw AppError.forbidden("This emergency access grant is not active.");
    }

    // Validate stored scope again; never use client input as a DB projection.
    const fields = grant.requestedFields.filter((field): field is BreakGlassField =>
      (BREAK_GLASS_FIELDS as readonly string[]).includes(field),
    );

    if (fields.length === 0 || fields.length !== grant.requestedFields.length) {
      throw AppError.forbidden("The approved field scope is invalid.");
    }

    const employee = await Employee.findById(grant.targetEmployeeId).lean();
    if (!employee) throw AppError.notFound("Target employee not found.");

    // Audit before returning any sensitive values. Failure means no data response.
    await writeBreakGlassAudit(
      actor.userId,
      "BREAK_GLASS_DATA_ACCESSED",
      String(grant._id),
      grant.targetEmployeeId,
      req,
      { fields },
    );

    // Recheck authorization immediately before returning sensitive data.
    const activeGrant = await BreakGlassRequest.findOne({
      _id: grant._id,
      requesterUserId: actor.userId,
      status: "APPROVED",
      revokedAt: null,
      expiresAt: { $gt: nowIso() },
    }).select("_id").lean();

    if (!activeGrant) {
      throw AppError.forbidden(
        "Emergency access is no longer active."
      );
    }

    const data: Record<string, unknown> = {};
    for (const field of fields) {
      data[field] = employee[field];
    }

    res.set("Cache-Control", "no-store, private");
    res.set("Pragma", "no-cache");
    res.json({
      requestId: String(grant._id),
      targetEmployeeId: grant.targetEmployeeId,
      expiresAt: grant.expiresAt,
      fields: data,
    });
  } catch (err) {
    next(err);
  }
});
