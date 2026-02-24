import mongoose, { Schema, Document, Model } from "mongoose";

/* ------------------------------------------------------------------ */
/*  AttributionDaily                                                    */
/*  Materialized daily aggregates per workspace × query.               */
/*  Computed by nightly cron; UI reads this table first for speed.     */
/* ------------------------------------------------------------------ */

export type ModelSource = "ga4" | "model" | "heuristic";

export interface IAttributionDaily extends Document {
  _id: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;

  /** Date bucket YYYY-MM-DD */
  date: string;

  /** Query this row pertains to */
  queryId: mongoose.Types.ObjectId;

  /** Query text (denormalized for display) */
  queryText: string;

  /** Number of TrackingResult observations that day */
  visibilityCount: number;

  /** Brand mention count that day */
  brandMentionCount: number;

  /** Visibility rate 0–100 */
  visibilityRate: number;

  /** Total agent requests for matched pages that day */
  agentRequests: number;

  /** Agent requests per engine */
  agentRequestsByEngine: Record<string, number>;

  /** GA4 sessions attributed (if available) */
  ga4Sessions: number;

  /** GA4 conversions attributed (if available) */
  ga4Conversions: number;

  /** Model-estimated clicks */
  estClicks: number;

  /** Model-estimated conversions */
  estConversions: number;

  /** Which model produced the estimates */
  modelSource: ModelSource;

  /** Model version that produced these estimates */
  modelVersion: string;

  /** Match confidence 0–1 */
  matchConfidence: number;

  /** Search volume for the query (denormalized) */
  searchVolume: number;

  /** Positive sentiment rate 0–100 */
  positiveRate: number;

  /** Feature contributions for explainability */
  featureContributions: Array<{
    name: string;
    value: number;
    contribution: number;
  }>;

  createdAt: Date;
  updatedAt: Date;
}

const FeatureContributionSchema = new Schema(
  {
    name: { type: String, required: true },
    value: { type: Number, default: 0 },
    contribution: { type: Number, default: 0 },
  },
  { _id: false }
);

const AttributionDailySchema = new Schema<IAttributionDaily>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    date: { type: String, required: true },
    queryId: { type: Schema.Types.ObjectId, ref: "Query", required: true },
    queryText: { type: String, default: "" },
    visibilityCount: { type: Number, default: 0 },
    brandMentionCount: { type: Number, default: 0 },
    visibilityRate: { type: Number, default: 0 },
    agentRequests: { type: Number, default: 0 },
    agentRequestsByEngine: { type: Schema.Types.Mixed, default: {} },
    ga4Sessions: { type: Number, default: 0 },
    ga4Conversions: { type: Number, default: 0 },
    estClicks: { type: Number, default: 0 },
    estConversions: { type: Number, default: 0 },
    modelSource: {
      type: String,
      enum: ["ga4", "model", "heuristic"],
      default: "heuristic",
    },
    modelVersion: { type: String, default: "v1.0" },
    matchConfidence: { type: Number, default: 0, min: 0, max: 1 },
    searchVolume: { type: Number, default: 0 },
    positiveRate: { type: Number, default: 0 },
    featureContributions: [FeatureContributionSchema],
  },
  { timestamps: true }
);

// Unique composite — one row per workspace + date + query
AttributionDailySchema.index(
  { workspaceId: 1, date: 1, queryId: 1 },
  { unique: true }
);
AttributionDailySchema.index({ workspaceId: 1, date: 1, modelSource: 1 });
AttributionDailySchema.index({ workspaceId: 1, queryId: 1, date: 1 });

const AttributionDaily: Model<IAttributionDaily> =
  mongoose.models.AttributionDaily ||
  mongoose.model<IAttributionDaily>(
    "AttributionDaily",
    AttributionDailySchema
  );

export default AttributionDaily;
