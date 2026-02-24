import mongoose, { Schema, Document, Model } from "mongoose";

export type PromptEngine = "chatgpt" | "gemini" | "claude" | "perplexity";
export type PromptIntent = "informational" | "transactional" | "navigational" | "follow-up";
export type PromptSentiment = "positive" | "negative" | "neutral" | "mixed";
export type ProvenanceType = "observed" | "synthetic" | "model-inferred";
export type ConfidenceLevel = "high" | "medium" | "low";

export interface IEngineBreakdown {
  engine: PromptEngine;
  volume: number;
  share: number; // percentage 0-100
}

export interface IRegionBreakdown {
  region: string; // ISO 3166-1 alpha-2
  volume: number;
  share: number;
}

export interface ITrendPoint {
  date: Date;
  volume: number;
  delta: number; // % change from previous period
}

export interface IPromptVolume extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId; // workspaceId
  /** Canonical topic text (clustered/normalized query) */
  canonicalTopic: string;
  /** Sample exemplar prompts belonging to this topic */
  exemplarPrompts: string[];
  /** Estimated total volume across all engines */
  estimatedVolume: number;
  /** Confidence interval lower bound */
  volumeCILow: number;
  /** Confidence interval upper bound */
  volumeCIHigh: number;
  /** Qualitative confidence level */
  confidence: ConfidenceLevel;
  /** Per-engine volume breakdown */
  engineBreakdown: IEngineBreakdown[];
  /** Per-region volume breakdown */
  regionBreakdown: IRegionBreakdown[];
  /** Intent classification */
  intent: PromptIntent;
  /** Sentiment classification */
  sentiment: PromptSentiment;
  /** Provenance: observed vs synthetic vs model-inferred */
  provenance: ProvenanceType;
  /** Fraction of volume from observed data (0-1) */
  observedFraction: number;
  /** Fraction of volume from synthetic data (0-1) */
  syntheticFraction: number;
  /** Parent topic ID for hierarchical clustering */
  parentTopicId?: mongoose.Types.ObjectId;
  /** Related topic IDs (semantic neighbors) */
  relatedTopicIds: mongoose.Types.ObjectId[];
  /** Tags for categorization */
  tags: string[];
  /** ISO language code */
  language: string;
  /** Trend data points (weekly aggregates) */
  trendData: ITrendPoint[];
  /** Week-over-week change percentage */
  weekOverWeekChange: number;
  /** Whether this topic is currently trending (spike detected) */
  isTrending: boolean;
  /** Trend direction */
  trendDirection: "rising" | "falling" | "stable";
  /** Period this aggregate covers */
  periodStart: Date;
  periodEnd: Date;
  /** Granularity of the aggregate */
  granularity: "daily" | "weekly" | "monthly";
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const EngineBreakdownSchema = new Schema<IEngineBreakdown>(
  {
    engine: {
      type: String,
      enum: ["chatgpt", "gemini", "claude", "perplexity"],
      required: true,
    },
    volume: { type: Number, required: true, default: 0 },
    share: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const RegionBreakdownSchema = new Schema<IRegionBreakdown>(
  {
    region: { type: String, required: true },
    volume: { type: Number, required: true, default: 0 },
    share: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const TrendPointSchema = new Schema<ITrendPoint>(
  {
    date: { type: Date, required: true },
    volume: { type: Number, required: true, default: 0 },
    delta: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const PromptVolumeSchema = new Schema<IPromptVolume>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    canonicalTopic: { type: String, required: true },
    exemplarPrompts: { type: [String], default: [] },
    estimatedVolume: { type: Number, required: true, default: 0 },
    volumeCILow: { type: Number, default: 0 },
    volumeCIHigh: { type: Number, default: 0 },
    confidence: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium",
    },
    engineBreakdown: { type: [EngineBreakdownSchema], default: [] },
    regionBreakdown: { type: [RegionBreakdownSchema], default: [] },
    intent: {
      type: String,
      enum: ["informational", "transactional", "navigational", "follow-up"],
      default: "informational",
    },
    sentiment: {
      type: String,
      enum: ["positive", "negative", "neutral", "mixed"],
      default: "neutral",
    },
    provenance: {
      type: String,
      enum: ["observed", "synthetic", "model-inferred"],
      default: "observed",
    },
    observedFraction: { type: Number, default: 1, min: 0, max: 1 },
    syntheticFraction: { type: Number, default: 0, min: 0, max: 1 },
    parentTopicId: { type: Schema.Types.ObjectId, ref: "PromptVolume" },
    relatedTopicIds: {
      type: [Schema.Types.ObjectId],
      ref: "PromptVolume",
      default: [],
    },
    tags: { type: [String], default: [] },
    language: { type: String, default: "en" },
    trendData: { type: [TrendPointSchema], default: [] },
    weekOverWeekChange: { type: Number, default: 0 },
    isTrending: { type: Boolean, default: false },
    trendDirection: {
      type: String,
      enum: ["rising", "falling", "stable"],
      default: "stable",
    },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    granularity: {
      type: String,
      enum: ["daily", "weekly", "monthly"],
      default: "weekly",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Indexes for efficient querying
PromptVolumeSchema.index({ tenantId: 1 });
PromptVolumeSchema.index({ tenantId: 1, canonicalTopic: "text" });
PromptVolumeSchema.index({ tenantId: 1, estimatedVolume: -1 });
PromptVolumeSchema.index({ tenantId: 1, intent: 1 });
PromptVolumeSchema.index({ tenantId: 1, sentiment: 1 });
PromptVolumeSchema.index({ tenantId: 1, isTrending: 1 });
PromptVolumeSchema.index({ tenantId: 1, periodStart: 1, periodEnd: 1 });
PromptVolumeSchema.index({ tenantId: 1, "engineBreakdown.engine": 1 });
PromptVolumeSchema.index({ tenantId: 1, "regionBreakdown.region": 1 });
PromptVolumeSchema.index({ tenantId: 1, trendDirection: 1 });

const PromptVolume: Model<IPromptVolume> =
  mongoose.models.PromptVolume ||
  mongoose.model<IPromptVolume>("PromptVolume", PromptVolumeSchema);

export default PromptVolume;
