import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITrackingResult extends Document {
  _id: mongoose.Types.ObjectId;
  queryId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId; // workspaceId for easy filtering
  contentSnippet: string;
  sourceUrl: string;
  engine: string; // e.g. "google_ai_overview", "bing_chat", "chatgpt", "perplexity"
  isBrandMentioned: boolean;
  mentionType?: "explicit" | "implicit" | "none";
  sentiment?: "positive" | "neutral" | "negative";
  /** Which domain was detected in this source result (your brand or a competitor) */
  competitorDomain?: string;
  /** Position / rank of this source among all AI Overview sources (1-based) */
  sourcePosition?: number;
  /** Full AI Overview generated text (stored on every result row for easy access) */
  overviewText?: string;
  /** Brand text visibility score 0-100 based on where brand name appears in the AI response (100 = first word, 0 = not mentioned) */
  brandTextVisibility?: number;
  metadata?: Record<string, unknown>;
  fetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TrackingResultSchema = new Schema<ITrackingResult>(
  {
    queryId: { type: Schema.Types.ObjectId, ref: "Query", required: true },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    contentSnippet: { type: String, default: "" },
    sourceUrl: { type: String, default: "" },
    engine: { type: String, default: "google_ai_overview" },
    isBrandMentioned: { type: Boolean, default: false },
    mentionType: {
      type: String,
      enum: ["explicit", "implicit", "none"],
      default: "none",
    },
    sentiment: {
      type: String,
      enum: ["positive", "neutral", "negative"],
    },
    competitorDomain: { type: String, default: "" },
    sourcePosition: { type: Number, default: 0 },
    overviewText: { type: String, default: "" },
    brandTextVisibility: { type: Number, default: 0 },
    metadata: { type: Schema.Types.Mixed, default: {} },
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

TrackingResultSchema.index({ queryId: 1, fetchedAt: -1 });
TrackingResultSchema.index({ tenantId: 1 });
TrackingResultSchema.index({ tenantId: 1, competitorDomain: 1 });
TrackingResultSchema.index({ tenantId: 1, engine: 1 });

const TrackingResult: Model<ITrackingResult> =
  mongoose.models.TrackingResult ||
  mongoose.model<ITrackingResult>("TrackingResult", TrackingResultSchema);

export default TrackingResult;
