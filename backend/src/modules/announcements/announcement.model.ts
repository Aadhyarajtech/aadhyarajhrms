<<<<<<< HEAD
import mongoose, {
  Schema,
  type Document,
  type Model,
} from "mongoose";

/* =========================================================
   ANNOUNCEMENT TYPES
========================================================= */
=======
import mongoose, { Document, Model, Schema } from "mongoose";
>>>>>>> f8f0289 (Added feature to check performance of the employees)

export const ANNOUNCEMENT_TYPES = [
  "HOLIDAY_NOTICE",
  "COMPANY_EVENT",
  "POLICY_UPDATE",
  "EMPLOYEE_RECOGNITION",
  "MEETING_NOTICE",
  "BENEFITS_UPDATE",
  "TRAINING_LD",
  "GENERAL_NOTICE",
] as const;

<<<<<<< HEAD
export type AnnouncementType =
  (typeof ANNOUNCEMENT_TYPES)[number];

/* =========================================================
   AUDIENCE TYPES

   ALL           -> All employees
   HR_ADMIN      -> HR team
   FINANCE       -> Finance / Payroll
   MANAGER       -> Managers
   RECRUITER     -> Recruitment team
   IT_SUPPORT    -> IT Support
   EMPLOYEE      -> Employees
   DEPARTMENT    -> Specific departments
   TARGETED_GROUP -> Specific roles / groups
========================================================= */
=======
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];
>>>>>>> f8f0289 (Added feature to check performance of the employees)

export const ANNOUNCEMENT_AUDIENCES = [
  "ALL",
  "HR_ADMIN",
  "FINANCE",
  "MANAGER",
  "RECRUITER",
  "IT_SUPPORT",
  "EMPLOYEE",
  "DEPARTMENT",
  "TARGETED_GROUP",
] as const;

<<<<<<< HEAD
export type AnnouncementAudience =
  (typeof ANNOUNCEMENT_AUDIENCES)[number];

/* =========================================================
   DELIVERY CHANNELS
========================================================= */
=======
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];
>>>>>>> f8f0289 (Added feature to check performance of the employees)

export const ANNOUNCEMENT_CHANNELS = [
  "IN_APP",
  "EMAIL",
  "BANNER",
  "CALENDAR",
] as const;

<<<<<<< HEAD
export type AnnouncementChannel =
  (typeof ANNOUNCEMENT_CHANNELS)[number];

/* =========================================================
   PUBLISH STATUS
========================================================= */
=======
export type AnnouncementChannel = (typeof ANNOUNCEMENT_CHANNELS)[number];
>>>>>>> f8f0289 (Added feature to check performance of the employees)

export const ANNOUNCEMENT_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHED",
] as const;

<<<<<<< HEAD
export type AnnouncementStatus =
  (typeof ANNOUNCEMENT_STATUSES)[number];

/* =========================================================
   DOCUMENT
========================================================= */

export interface IAnnouncement extends Document {
  /* Basic information */
  title: string;
  body: string;

  /* Classification */
  type: AnnouncementType;

  /* Audience */
  audience: AnnouncementAudience;

  /* Department targeting */
  departments: string[];

  /* Location targeting */
  locations: string[];

  /* Role / group targeting */
  targetRoles: string[];

  /* Delivery channels */
  channels: AnnouncementChannel[];

  /* Dashboard banner */
  showBanner: boolean;

  /* Read receipt / acknowledgement */
  requiresAcknowledgement: boolean;

  /* Pin important announcement */
  pinned: boolean;

  /* Optional uploaded attachment */
  attachment?: string;

  /* Creator */
  createdBy: string;

  /* Publishing */
  status: AnnouncementStatus;

  scheduledAt?: string;

  publishedAt?: string;

  /* Calendar / meeting */
  calendarEnabled: boolean;

  eventStartAt?: string;

  eventEndAt?: string;

  eventLocation?: string;

  /* Timestamps */
  createdAt: string;

  updatedAt: string;
}

/* =========================================================
   SCHEMA
========================================================= */

const announcementSchema =
  new Schema<IAnnouncement>(
    {
      /* ---------------------------------------------------
         BASIC INFORMATION
      --------------------------------------------------- */

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

      /* ---------------------------------------------------
         ANNOUNCEMENT TYPE
      --------------------------------------------------- */

      type: {
        type: String,
        required: true,
        enum: ANNOUNCEMENT_TYPES,
        index: true,
      },

      /* ---------------------------------------------------
         AUDIENCE
      --------------------------------------------------- */

      audience: {
        type: String,
        required: true,
        enum: ANNOUNCEMENT_AUDIENCES,
        default: "ALL",
        index: true,
      },

      /* ---------------------------------------------------
         DEPARTMENT TARGETING
      --------------------------------------------------- */

      departments: {
        type: [String],
        default: [],
        index: true,
      },

      /* ---------------------------------------------------
         LOCATION TARGETING
      --------------------------------------------------- */

      locations: {
        type: [String],
        default: [],
        index: true,
      },

      /* ---------------------------------------------------
         TARGETED GROUP / ROLE
      --------------------------------------------------- */

      targetRoles: {
        type: [String],
        default: [],
        index: true,
      },

      /* ---------------------------------------------------
         MULTI-CHANNEL DELIVERY

         IN_APP
         EMAIL
         BANNER
         CALENDAR
      --------------------------------------------------- */

      channels: {
        type: [String],
        enum: ANNOUNCEMENT_CHANNELS,
        default: ["IN_APP"],
      },

      /* ---------------------------------------------------
         DASHBOARD BANNER
      --------------------------------------------------- */

      showBanner: {
        type: Boolean,
        default: false,
      },

      /* ---------------------------------------------------
         READ RECEIPT / ACKNOWLEDGEMENT
      --------------------------------------------------- */

      requiresAcknowledgement: {
        type: Boolean,
        default: false,
      },

      /* ---------------------------------------------------
         PIN
      --------------------------------------------------- */

      pinned: {
        type: Boolean,
        default: false,
      },

      /* ---------------------------------------------------
         ATTACHMENT
      --------------------------------------------------- */

      attachment: {
        type: String,
        default: "",
      },

      /* ---------------------------------------------------
         CREATED BY
      --------------------------------------------------- */

      createdBy: {
        type: String,
        required: true,
        index: true,
      },

      /* ---------------------------------------------------
         PUBLISHING
      --------------------------------------------------- */

      status: {
        type: String,
        required: true,
        enum: ANNOUNCEMENT_STATUSES,
        default: "DRAFT",
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

      /* ---------------------------------------------------
         CALENDAR / MEETING SUPPORT
      --------------------------------------------------- */

      calendarEnabled: {
        type: Boolean,
        default: false,
      },

      eventStartAt: {
        type: String,
        default: "",
      },

      eventEndAt: {
        type: String,
        default: "",
      },

      eventLocation: {
        type: String,
        default: "",
        maxlength: 500,
      },

      /* ---------------------------------------------------
         TIMESTAMPS
      --------------------------------------------------- */

      createdAt: {
        type: String,
        required: true,
        index: true,
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

/* =========================================================
   INDEXES
========================================================= */
=======
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export interface IAnnouncement extends Document {
  _id: string;

  title: string;
  body: string;

  type: AnnouncementType;
  audience: AnnouncementAudience;

  departments: string[];
  locations: string[];
  targetRoles: string[];

  channels: AnnouncementChannel[];

  pinned: boolean;
  showBanner: boolean;
  requiresAcknowledgement: boolean;

  attachment: string;

  createdBy: string;

  status: AnnouncementStatus;

  scheduledAt: string;
  publishedAt: string;

  calendarEnabled: boolean;
  eventStartAt: string;
  eventEndAt: string;
  eventLocation: string;

  createdAt: string;
  updatedAt: string;
}

const announcementSchema = new Schema<IAnnouncement>(
  {
    _id: {
      type: String,
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    body: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: ANNOUNCEMENT_TYPES,
      default: "GENERAL_NOTICE",
      required: true,
    },

    audience: {
      type: String,
      enum: ANNOUNCEMENT_AUDIENCES,
      default: "ALL",
      required: true,
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
      enum: ANNOUNCEMENT_CHANNELS,
      default: ["IN_APP"],
      validate: {
        validator: (value: AnnouncementChannel[]) => value.length > 0,
        message: "At least one notification channel is required",
      },
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

    createdBy: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ANNOUNCEMENT_STATUSES,
      default: "DRAFT",
      required: true,
    },

    scheduledAt: {
      type: String,
      default: "",
    },

    publishedAt: {
      type: String,
      default: "",
    },

    calendarEnabled: {
      type: Boolean,
      default: false,
    },

    eventStartAt: {
      type: String,
      default: "",
    },

    eventEndAt: {
      type: String,
      default: "",
    },

    eventLocation: {
      type: String,
      default: "",
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
    timestamps: false,
  },
);
>>>>>>> f8f0289 (Added feature to check performance of the employees)

announcementSchema.index({
  status: 1,
  publishedAt: -1,
});

announcementSchema.index({
  status: 1,
  scheduledAt: 1,
});

announcementSchema.index({
  audience: 1,
  departments: 1,
});

announcementSchema.index({
  audience: 1,
  locations: 1,
});

announcementSchema.index({
  audience: 1,
  targetRoles: 1,
});

<<<<<<< HEAD
/* =========================================================
   MODEL
========================================================= */

export const Announcement: Model<IAnnouncement> =
  mongoose.models.Announcement ||
  mongoose.model<IAnnouncement>(
    "Announcement",
    announcementSchema,
  );

export default Announcement;
=======
export const Announcement: Model<IAnnouncement> =
  (mongoose.models.Announcement as Model<IAnnouncement>) ||
  mongoose.model<IAnnouncement>("Announcement", announcementSchema);

export default Announcement;
>>>>>>> f8f0289 (Added feature to check performance of the employees)
