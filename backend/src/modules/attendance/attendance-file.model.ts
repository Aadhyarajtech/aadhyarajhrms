import mongoose, { Schema } from "mongoose";

const attendanceFileSchema = new Schema(
    {
        originalName: {
            type: String,
            required: true,
            maxlength: 255,
        },
        storageName: {
            type: String,
            required: true,
            unique: true,
        },
        uploadedBy: {
            type: String,
            required: true,
        },
        uploaderName: {
            type: String,
            required: true,
        },
        mimeType: {
            type: String,
            required: true,
        },
        size: {
            type: Number,
            required: true,
        },
        uploadedAt: {
            type: Date,
            required: true,
            default: Date.now,
        },
    },
    {
        versionKey: false,
    },
);

attendanceFileSchema.index({ uploadedAt: -1 });

export const AttendanceFile =
    mongoose.models.AttendanceFile ||
    mongoose.model("AttendanceFile", attendanceFileSchema);