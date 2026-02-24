import mongoose, { Schema, Document, Model } from "mongoose";

export type AlertChannel = "email" | "slack" | "webhook";
export type AlertTrigger = "threshold" | "change" | "trending";

export interface IPromptVolumeAlert extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId; // workspaceId
  /** Human-readable name for this alert rule */
  name: string;
  /** What triggers the alert */
  triggerType: AlertTrigger;
  /** Topic ID to watch (optional — if empty, watches all topics) */
  topicId?: mongoose.Types.ObjectId;
  /** Keyword/query pattern to watch */
  queryPattern?: string;
  /** Engines to filter on (empty = all) */
  engines: string[];
  /** Regions to filter on (empty = all) */
  regions: string[];
  /** For threshold triggers: minimum volume to trigger */
  thresholdValue?: number;
  /** For change triggers: minimum % change to trigger */
  changePercent?: number;
  /** Delivery channels */
  channels: AlertChannel[];
  /** Webhook URL (if webhook channel selected) */
  webhookUrl?: string;
  /** Slack channel/webhook (if slack channel selected) */
  slackWebhook?: string;
  /** Email address for delivery (if email channel) */
  email?: string;
  /** Whether the alert is active */
  isActive: boolean;
  /** Last time the alert was triggered */
  lastTriggeredAt?: Date;
  /** Number of times triggered */
  triggerCount: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PromptVolumeAlertSchema = new Schema<IPromptVolumeAlert>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    name: { type: String, required: true },
    triggerType: {
      type: String,
      enum: ["threshold", "change", "trending"],
      required: true,
    },
    topicId: { type: Schema.Types.ObjectId, ref: "PromptVolume" },
    queryPattern: { type: String },
    engines: { type: [String], default: [] },
    regions: { type: [String], default: [] },
    thresholdValue: { type: Number },
    changePercent: { type: Number },
    channels: {
      type: [String],
      enum: ["email", "slack", "webhook"],
      default: ["email"],
    },
    webhookUrl: { type: String },
    slackWebhook: { type: String },
    email: { type: String },
    isActive: { type: Boolean, default: true },
    lastTriggeredAt: { type: Date },
    triggerCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

PromptVolumeAlertSchema.index({ tenantId: 1 });
PromptVolumeAlertSchema.index({ tenantId: 1, isActive: 1 });
PromptVolumeAlertSchema.index({ tenantId: 1, topicId: 1 });

const PromptVolumeAlert: Model<IPromptVolumeAlert> =
  mongoose.models.PromptVolumeAlert ||
  mongoose.model<IPromptVolumeAlert>(
    "PromptVolumeAlert",
    PromptVolumeAlertSchema
  );

export default PromptVolumeAlert;
