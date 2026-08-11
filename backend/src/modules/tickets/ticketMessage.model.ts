import mongoose, { Schema, type Document } from "mongoose";

export interface ITicketMessage extends Document {
  ticketId: string;
  employeeId: string;
  senderName: string;
  senderRole: string;
  message: string;
  createdAt: Date;
}

const ticketMessageSchema = new Schema<ITicketMessage>(
  {
    ticketId: {
      type: String,
      required: true,
      index: true,
    },

    employeeId: {
      type: String,
      required: true,
    },

    senderName: {
      type: String,
      required: true,
    },

    senderRole: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

export const TicketMessage = mongoose.model<ITicketMessage>(
  "TicketMessage",
  ticketMessageSchema,
);