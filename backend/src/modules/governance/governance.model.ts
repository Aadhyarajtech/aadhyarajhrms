import { Schema, model } from "mongoose";
import { genId } from "@/utils/id";

export const GOVERNANCE_ROLES = [
  "SUPER_ADMIN",
  "HR_ADMIN",
  "MANAGER",
  "RECRUITER",
  "FINANCE",
  "IT_SUPPORT",
  "EMPLOYEE",
] as const;

export type GovernanceRole = (typeof GOVERNANCE_ROLES)[number];

export interface GovernanceRoleDoc {
  _id: string;
  role: GovernanceRole;
  label: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

const governanceRoleSchema = new Schema<GovernanceRoleDoc>(
  {
    _id: { type: String, default: () => genId("grl") },
    role: {
      type: String,
      enum: GOVERNANCE_ROLES,
      required: true,
      unique: true,
    },
    label: { type: String, required: true },
    description: { type: String, required: true },
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false },
);

export const GovernanceRole = model<GovernanceRoleDoc>(
  "GovernanceRole",
  governanceRoleSchema,
);

export interface GovernancePolicyDoc {
  _id: string;
  key: string;
  label: string;
  description: string;
  type: "BOOLEAN" | "NUMBER" | "TEXT";
  value: boolean | number | string;
  category: "SECURITY" | "WORKFLOW" | "HR_POLICY" | "GOVERNANCE";
  updatedBy: string | null;
  updatedAt: string;
}

const governancePolicySchema = new Schema<GovernancePolicyDoc>(
  {
    _id: { type: String, default: () => genId("gpl") },
    key: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    description: { type: String, required: true },
    type: { type: String, enum: ["BOOLEAN", "NUMBER", "TEXT"], required: true },
    value: { type: Schema.Types.Mixed, required: true },
    category: {
      type: String,
      enum: ["SECURITY", "WORKFLOW", "HR_POLICY", "GOVERNANCE"],
      required: true,
    },
    updatedBy: { type: String, default: null },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false },
);

export const GovernancePolicy = model<GovernancePolicyDoc>(
  "GovernancePolicy",
  governancePolicySchema,
);
