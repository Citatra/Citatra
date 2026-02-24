import mongoose, { Schema, Document, Model } from "mongoose";

/* ------------------------------------------------------------------ */
/*  AgentEvidenceCache                                                 */
/*  Persistent per-query cache of agent evidence + page matching.      */
/*  Recomputed every 24 h or on new AgentRequest / TrackingResult.     */
/* ------------------------------------------------------------------ */

export interface IMatchedPage {
  url: string;
  pageId?: mongoose.Types.ObjectId;
  relevanceScore: number;
}

export interface ISampleRequest {
  timestamp: Date;
  engine: string;
  userAgent: string;
  responseTimeMs: number;
  excerpt: string;
}

export interface IAgentEvidenceCache extends Document {
  _id: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  queryId: mongoose.Types.ObjectId;

  /** When this cache entry was computed */
  computedAt: Date;

  /** Composite match confidence 0–1 */
  matchConfidence: number;

  /** Pages matched to this query (ranked by relevanceScore) */
  matchedPages: IMatchedPage[];

  /** Agent request counts by engine */
  requestCountsByEngine: Record<string, number>;

  /** Total agent requests matched */
  totalRequests: number;

  /** Top agent purposes {purpose: count} */
  purposeBreakdown: Record<string, number>;

  /** Sample agent request for UI display */
  topSampleRequest?: ISampleRequest;

  /** Agent exposure recency: hours since most recent request */
  recencyHours: number;

  /** Average page relevance score */
  avgPageRelevance: number;

  /** Engine distribution (fractional, sums to 1) */
  engineDistribution: Record<string, number>;

  /** Feature contributions for explainability */
  featureContributions: Array<{
    name: string;
    value: number;
    contribution: number;
  }>;

  /** TTL — auto-expire after 48h if not refreshed */
  ttlExpiresAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

const MatchedPageSchema = new Schema(
  {
    url: { type: String, required: true },
    pageId: { type: Schema.Types.ObjectId, ref: "Page" },
    relevanceScore: { type: Number, default: 0 },
  },
  { _id: false }
);

const SampleRequestSchema = new Schema(
  {
    timestamp: { type: Date },
    engine: { type: String },
    userAgent: { type: String },
    responseTimeMs: { type: Number, default: 0 },
    excerpt: { type: String, default: "" },
  },
  { _id: false }
);

const FeatureContributionSchema = new Schema(
  {
    name: { type: String, required: true },
    value: { type: Number, default: 0 },
    contribution: { type: Number, default: 0 },
  },
  { _id: false }
);

const AgentEvidenceCacheSchema = new Schema<IAgentEvidenceCache>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    queryId: { type: Schema.Types.ObjectId, ref: "Query", required: true },
    computedAt: { type: Date, required: true },
    matchConfidence: { type: Number, default: 0, min: 0, max: 1 },
    matchedPages: [MatchedPageSchema],
    requestCountsByEngine: { type: Schema.Types.Mixed, default: {} },
    totalRequests: { type: Number, default: 0 },
    purposeBreakdown: { type: Schema.Types.Mixed, default: {} },
    topSampleRequest: SampleRequestSchema,
    recencyHours: { type: Number, default: Infinity },
    avgPageRelevance: { type: Number, default: 0 },
    engineDistribution: { type: Schema.Types.Mixed, default: {} },
    featureContributions: [FeatureContributionSchema],
    ttlExpiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// One cache entry per workspace + query
AgentEvidenceCacheSchema.index(
  { workspaceId: 1, queryId: 1 },
  { unique: true }
);
AgentEvidenceCacheSchema.index({ ttlExpiresAt: 1 }, { expireAfterSeconds: 0 });
AgentEvidenceCacheSchema.index({ workspaceId: 1, matchConfidence: -1 });

const AgentEvidenceCache: Model<IAgentEvidenceCache> =
  mongoose.models.AgentEvidenceCache ||
  mongoose.model<IAgentEvidenceCache>(
    "AgentEvidenceCache",
    AgentEvidenceCacheSchema
  );

export default AgentEvidenceCache;
