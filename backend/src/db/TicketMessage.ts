import mongoose, {
  Schema,
  type Document,
  type Model,
} from "mongoose";

export interface ITicketMessage extends Document {
  ticketId: string;
  employeeId: string;
  senderName: string;
  senderRole: string;
  message: string;
  attachment?: string;
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
      index: true,
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
      trim: true,
      maxlength: 5000,
      default: "",
    },

    attachment: {
      type: String,
      default: "",
    },

    createdAt: {
      type: Date,
      required: true,
    },
  },
  {
    versionKey: false,
  },
);

ticketMessageSchema.index({
  ticketId: 1,
  createdAt: 1,
});

export const TicketMessage: Model<ITicketMessage> =
  mongoose.models.TicketMessage ||
  mongoose.model<ITicketMessage>(
    "TicketMessage",
    ticketMessageSchema,
  );

export default TicketMessage;