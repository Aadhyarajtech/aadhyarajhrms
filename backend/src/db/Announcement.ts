import mongoose, {
  Schema,
  type Document,
  type Model,
} from "mongoose";

export interface IAnnouncement extends Document {
  title: string;
  body: string;

  type:
    | "HOLIDAY_NOTICE"
    | "COMPANY_EVENT"
    | "POLICY_UPDATE"
    | "EMPLOYEE_RECOGNITION"
    | "MEETING_NOTICE"
    | "BENEFITS_UPDATE"
    | "TRAINING_LD"
    | "GENERAL_NOTICE";

  audience:
    | "ALL"
    | "HR_ADMIN"
    | "FINANCE"
    | "MANAGER"
    | "RECRUITER"
    | "IT_SUPPORT"
    | "EMPLOYEE";

  departments: string[];
  locations: string[];
  targetRoles: string[];

  channels: ("IN_APP" | "EMAIL" | "BANNER")[];

  pinned: boolean;
  showBanner: boolean;
  requiresAcknowledgement: boolean;

  attachment: string;

  status: "DRAFT" | "SCHEDULED" | "PUBLISHED";

  scheduledAt: string;
  publishedAt: string;

  createdBy: string;

  createdAt: string;
  updatedAt: string;
}

const announcementSchema = new Schema<IAnnouncement>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10000,
    },

    type: {
      type: String,
      required: true,
      enum: [
        "HOLIDAY_NOTICE",
        "COMPANY_EVENT",
        "POLICY_UPDATE",
        "EMPLOYEE_RECOGNITION",
        "MEETING_NOTICE",
        "BENEFITS_UPDATE",
        "TRAINING_LD",
        "GENERAL_NOTICE",
      ],
      default: "GENERAL_NOTICE",
      index: true,
    },

    audience: {
      type: String,
      required: true,
      default: "ALL",
      enum: [
        "ALL",
        "HR_ADMIN",
        "FINANCE",
        "MANAGER",
        "RECRUITER",
        "IT_SUPPORT",
        "EMPLOYEE",
      ],
      index: true,
    },

    departments: {
      type: [String],
      default: [],
    },

    locations: {
      type: [String],
      default: [],
    },

    targetRoles: {
      type: [String],
      default: [],
    },

    channels: {
      type: [String],
      enum: [
        "IN_APP",
        "EMAIL",
        "BANNER",
      ],
      default: ["IN_APP"],
    },

    pinned: {
      type: Boolean,
      default: false,
    },

    showBanner: {
      type: Boolean,
      default: false,
    },

    requiresAcknowledgement: {
      type: Boolean,
      default: false,
    },

    attachment: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: [
        "DRAFT",
        "SCHEDULED",
        "PUBLISHED",
      ],
      default: "PUBLISHED",
      index: true,
    },

    scheduledAt: {
      type: String,
      default: "",
    },

    publishedAt: {
      type: String,
      default: "",
    },

    createdBy: {
      type: String,
      required: true,
      index: true,
    },

    createdAt: {
      type: String,
      required: true,
    },

    updatedAt: {
      type: String,
      required: true,
    },
  },
  {
    versionKey: false,
  },
);

/*
|--------------------------------------------------------------------------
| Indexes
|--------------------------------------------------------------------------
*/

announcementSchema.index({
  createdAt: -1,
});

announcementSchema.index({
  status: 1,
  scheduledAt: 1,
});

announcementSchema.index({
  audience: 1,
  createdAt: -1,
});

/*
|--------------------------------------------------------------------------
| Model
|--------------------------------------------------------------------------
*/

export const Announcement: Model<IAnnouncement> =
  mongoose.models.Announcement ||
  mongoose.model<IAnnouncement>(
    "Announcement",
    announcementSchema,
  );

export default Announcement;