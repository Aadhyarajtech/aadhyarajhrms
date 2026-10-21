
import mongoose, { Schema, model, type Model } from "mongoose";
import { genId } from "@/utils/id";

export const BREAK_GLASS_FIELDS = [
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
] as const;

export type BreakGlassField = (typeof BREAK_GLASS_FIELDS)[number];

export type BreakGlassStatus =
  | "PENDING"
  | "APPROVAL_AUDIT_PENDING"
  | "REJECTION_AUDIT_PENDING"
  | "APPROVED"
  | "REJECTED"
  | "REVOKED"
  | "EXPIRED";

export interface BreakGlassRequestDoc {
  _id: string;
  requesterUserId: string;
  requesterEmployeeId: string | null;
  targetEmployeeId: string;
  reason: string;
  requestedFields: BreakGlassField[];
  durationMinutes: number;
  status: BreakGlassStatus;
  approverUserId: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  decisionNote: string | null;
}

const breakGlassRequestSchema = new Schema<BreakGlassRequestDoc>(
  {
    _id: {
      type: String,
      default: () => genId("bgr"),
    },
    requesterUserId: { type: String, required: true, index: true },
    requesterEmployeeId: { type: String, default: null },
    targetEmployeeId: { type: String, required: true, index: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    requestedFields: {
      type: [String],
      required: true,
      enum: [...BREAK_GLASS_FIELDS],
      validate: {
        validator: (fields: string[]) =>
          fields.length > 0 && new Set(fields).size === fields.length,
        message: "Select unique, permitted fields.",
      },
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 1,
      max: 30,
    },
    status: {
      type: String,
      required: true,
      enum: [
        "PENDING",
        "APPROVAL_AUDIT_PENDING",
        "REJECTION_AUDIT_PENDING",
        "APPROVED",
        "REJECTED",
        "REVOKED",
        "EXPIRED",
      ],
      default: "PENDING",
      index: true,
    },
    approverUserId: { type: String, default: null },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
    approvedAt: { type: String, default: null },
    expiresAt: { type: String, default: null, index: true },
    revokedAt: { type: String, default: null },
    decisionNote: { type: String, default: null, maxlength: 1000 },
  },
  {
    versionKey: false,
    _id: false,
  },
);

breakGlassRequestSchema.index({
  requesterUserId: 1,
  status: 1,
  createdAt: -1,
});
export const BreakGlassRequest =
  (mongoose.models.BreakGlassRequest as Model<BreakGlassRequestDoc> | undefined) ??
  model<BreakGlassRequestDoc>("BreakGlassRequest", breakGlassRequestSchema);