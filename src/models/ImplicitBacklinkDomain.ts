import mongoose, { Schema, Document, Model } from "mongoose";

/* ------------------------------------------------------------------ */
/*  ImplicitBacklinkDomain                                             */
/*  Aggregated per-domain rollup of AI citation authority signals.     */
/*  Populated / refreshed by the daily cron and real-time upserts.     */
/* ------------------------------------------------------------------ */

export interface IImplicitBacklinkDomain extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;

  /** Canonical domain (www. stripped) */
  domain: string;

  /** First URL we saw cited from this domain */
  firstCitedUrl: string;

  /** Unique cited URLs from this domain */
  citedUrls: string[];

  /** Total citation count across all AI responses */
  citationCount: number;

  /** Citations broken down by engine { engine: count } */
  citationsByEngine: Record<string, number>;

  /** Count of citations where brand was explicitly mentioned */
  brandMentions: number;

  /** Sentiment histogram { positive: N, neutral: N, negative: N } */
  sentimentCounts: Record<string, number>;

  /** Dominant sentiment label */
  dominantSentiment: string;

  /** Number of distinct days with at least one citation */
  distinctCitationDays: number;

  /** First seen date */
  firstSeen: Date;

  /** Last seen date */
  lastSeen: Date;

  /* ── Scoring subcomponents (0–1 normalized) ─────────────────── */

  /** Citation Frequency subcomponent (0–1) */
  scoreCitationFreq: number;

  /** Temporal Consistency subcomponent (0–1) */
  scoreTemporalConsistency: number;

  /** Brand Mention Rate subcomponent (0–1) */
  scoreBrandMentionRate: number;

  /** Source Authority subcomponent (0–1) — internal estimate */
  scoreSourceAuthority: number;

  /** Contextual Relevance subcomponent (0–1) — placeholder for embedding similarity */
  scoreContextualRelevance: number;

  /** Sentiment Impact subcomponent (0–1) */
  scoreSentimentImpact: number;

  /** AI Relevance subcomponent (0–1) — engine-weighted */
  scoreAiRelevance: number;

  /** Composite quality score (0–100) */
  qualityScore: number;

  /** Quality bucket: "high" | "medium" | "low" */
  qualityBucket: string;

  /** AI Relevance % (0–100) for display */
  aiRelevancePercent: number;

  /** Domain type classification (editorial, ugc, etc.) */
  domainType: string;

  /** Daily citation counts for sparkline { "YYYY-MM-DD": count } — last 90 days */
  dailyCitations: Record<string, number>;

  /** Sample snippet from the most recent citation */
  sampleSnippet: string;

  /** Top engines (sorted by count) */
  topEngines: string[];

  createdAt: Date;
  updatedAt: Date;
}

const ImplicitBacklinkDomainSchema = new Schema<IImplicitBacklinkDomain>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    domain: { type: String, required: true },
    firstCitedUrl: { type: String, default: "" },
    citedUrls: [{ type: String }],
    citationCount: { type: Number, default: 0 },
    citationsByEngine: { type: Schema.Types.Mixed, default: {} },
    brandMentions: { type: Number, default: 0 },
    sentimentCounts: { type: Schema.Types.Mixed, default: {} },
    dominantSentiment: { type: String, default: "neutral" },
    distinctCitationDays: { type: Number, default: 0 },
    firstSeen: { type: Date, required: true },
    lastSeen: { type: Date, required: true },

    // Scoring subcomponents (0–1)
    scoreCitationFreq: { type: Number, default: 0, min: 0, max: 1 },
    scoreTemporalConsistency: { type: Number, default: 0, min: 0, max: 1 },
    scoreBrandMentionRate: { type: Number, default: 0, min: 0, max: 1 },
    scoreSourceAuthority: { type: Number, default: 0, min: 0, max: 1 },
    scoreContextualRelevance: { type: Number, default: 0, min: 0, max: 1 },
    scoreSentimentImpact: { type: Number, default: 0, min: 0, max: 1 },
    scoreAiRelevance: { type: Number, default: 0, min: 0, max: 1 },

    qualityScore: { type: Number, default: 0 },
    qualityBucket: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "low",
    },
    aiRelevancePercent: { type: Number, default: 0 },

    domainType: {
      type: String,
      enum: [
        "corporate",
        "editorial",
        "institutional",
        "ugc",
        "reference",
        "competitor",
        "other",
      ],
      default: "other",
    },

    dailyCitations: { type: Schema.Types.Mixed, default: {} },
    sampleSnippet: { type: String, default: "" },
    topEngines: [{ type: String }],
  },
  { timestamps: true }
);

// Unique per workspace + domain
ImplicitBacklinkDomainSchema.index(
  { tenantId: 1, domain: 1 },
  { unique: true }
);
ImplicitBacklinkDomainSchema.index({ tenantId: 1, qualityScore: -1 });
ImplicitBacklinkDomainSchema.index({ tenantId: 1, citationCount: -1 });
ImplicitBacklinkDomainSchema.index({ tenantId: 1, domainType: 1 });

const ImplicitBacklinkDomain: Model<IImplicitBacklinkDomain> =
  mongoose.models.ImplicitBacklinkDomain ||
  mongoose.model<IImplicitBacklinkDomain>(
    "ImplicitBacklinkDomain",
    ImplicitBacklinkDomainSchema
  );

export default ImplicitBacklinkDomain;
