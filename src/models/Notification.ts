import mongoose, { Schema, Document, Model } from "mongoose";

export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId; // workspaceId
  userId?: mongoose.Types.ObjectId; // optional: target user, or null = workspace-wide
  type:
    | "brand_mentioned"
    | "brand_dropped"
    | "new_overview"
    | "weekly_digest"
    | "system";
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  read: boolean;
  channel: "in_app" | "email" | "slack";
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    type: {
      type: String,
      enum: [
        "brand_mentioned",
        "brand_dropped",
        "new_overview",
        "weekly_digest",
        "system",
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false },
    channel: {
      type: String,
      enum: ["in_app", "email", "slack"],
      default: "in_app",
    },
    sentAt: { type: Date },
  },
  { timestamps: true }
);

NotificationSchema.index({ tenantId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, read: 1 });

const Notification: Model<INotification> =
  mongoose.models.Notification ||
  mongoose.model<INotification>("Notification", NotificationSchema);

export default Notification;
