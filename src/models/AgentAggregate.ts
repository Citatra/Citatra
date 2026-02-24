import mongoose, { Schema, Document, Model } from "mongoose";

/* ------------------------------------------------------------------ */
/*  Agent Aggregate — pre-computed daily rollups per query × engine     */
/* ------------------------------------------------------------------ */

export interface IAgentAggregate extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;

  /** Date bucket (YYYY-MM-DD, start of day UTC) */
  date: string;

  /** Optional query ID link — null for site-level aggregates */
  queryId?: mongoose.Types.ObjectId;

  /** Canonical URL (for page-level aggregates) */
  canonicalUrl?: string;

  /** Engine this aggregate is for */
  engine: string;

  /** Number of agent requests in this bucket */
  requestCount: number;

  /** Unique canonical URLs accessed */
  uniquePages: number;

  /** Average response time (ms) */
  avgResponseTimeMs: number;

  /** Cache hit rate 0–1 */
  cacheHitRate: number;

  /** Top countries {code: count} */
  topCountries: Record<string, number>;

  /** Agent purpose breakdown {purpose: count} */
  purposeBreakdown: Record<string, number>;

  /** Average classification confidence */
  avgClassificationConfidence: number;

  createdAt: Date;
}

const AgentAggregateSchema = new Schema<IAgentAggregate>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    date: { type: String, required: true },
    queryId: { type: Schema.Types.ObjectId, ref: "Query" },
    canonicalUrl: { type: String },
    engine: { type: String, required: true },
    requestCount: { type: Number, default: 0 },
    uniquePages: { type: Number, default: 0 },
    avgResponseTimeMs: { type: Number, default: 0 },
    cacheHitRate: { type: Number, default: 0, min: 0, max: 1 },
    topCountries: { type: Schema.Types.Mixed, default: {} },
    purposeBreakdown: { type: Schema.Types.Mixed, default: {} },
    avgClassificationConfidence: { type: Number, default: 0, min: 0, max: 1 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Unique composite index for upserts
AgentAggregateSchema.index(
  { tenantId: 1, date: 1, engine: 1, canonicalUrl: 1 },
  { unique: true }
);
AgentAggregateSchema.index({ tenantId: 1, date: 1 });
AgentAggregateSchema.index({ tenantId: 1, queryId: 1, date: 1 });

const AgentAggregate: Model<IAgentAggregate> =
  mongoose.models.AgentAggregate ||
  mongoose.model<IAgentAggregate>("AgentAggregate", AgentAggregateSchema);

export default AgentAggregate;
