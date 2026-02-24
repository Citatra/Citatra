import mongoose, { Schema, Document, Model } from "mongoose";

export interface INotificationPreference extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId; // workspace-scoped prefs
  emailOnMention: boolean;
  emailOnDrop: boolean;
  emailDigest: boolean;
  slackWebhookUrl?: string;
  slackOnMention: boolean;
  slackOnDrop: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationPreferenceSchema = new Schema<INotificationPreference>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    emailOnMention: { type: Boolean, default: true },
    emailOnDrop: { type: Boolean, default: true },
    emailDigest: { type: Boolean, default: false },
    slackWebhookUrl: { type: String },
    slackOnMention: { type: Boolean, default: false },
    slackOnDrop: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NotificationPreferenceSchema.index({ userId: 1, tenantId: 1 }, { unique: true });

const NotificationPreference: Model<INotificationPreference> =
  mongoose.models.NotificationPreference ||
  mongoose.model<INotificationPreference>(
    "NotificationPreference",
    NotificationPreferenceSchema
  );

export default NotificationPreference;
