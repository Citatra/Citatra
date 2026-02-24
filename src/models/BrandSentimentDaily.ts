import mongoose, { Schema, Document, Model } from "mongoose";

/* ------------------------------------------------------------------ */
/*  BrandSentimentDaily                                                */
/*  Pre-aggregated daily sentiment rollups per workspace / entity /    */
/*  engine / topic.  Populated by the cron enrichment pipeline.        */
/* ------------------------------------------------------------------ */

export interface IBrandSentimentDaily extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;

  /** Date bucket YYYY-MM-DD (start of day UTC) */
  date: string;

  /** Entity name (brand or competitor domain) */
  entity: string;

  /** AI engine that produced the responses */
  engine: string;

  /** Topic / theme grouping (optional) */
  topicId?: string;

  /** Total responses mentioning this entity on this day */
  mentions: number;

  /** Sentiment breakdown counts */
  positive: number;
  neutral: number;
  negative: number;

  /** Average classifier confidence [0–1] */
  avgConfidence: number;

  /** Fraction of responses that had citation sources [0–1] */
  provenanceFraction: number;

  /** Sample response IDs for drill-down */
  sampleResponseIds: mongoose.Types.ObjectId[];

  createdAt: Date;
}

const BrandSentimentDailySchema = new Schema<IBrandSentimentDaily>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    date: { type: String, required: true },
    entity: { type: String, required: true },
    engine: { type: String, required: true },
    topicId: { type: String, default: "" },
    mentions: { type: Number, default: 0 },
    positive: { type: Number, default: 0 },
    neutral: { type: Number, default: 0 },
    negative: { type: Number, default: 0 },
    avgConfidence: { type: Number, default: 0, min: 0, max: 1 },
    provenanceFraction: { type: Number, default: 0, min: 0, max: 1 },
    sampleResponseIds: [{ type: Schema.Types.ObjectId, ref: "TrackingResult" }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Unique composite for upserts
BrandSentimentDailySchema.index(
  { tenantId: 1, date: 1, entity: 1, engine: 1, topicId: 1 },
  { unique: true }
);
BrandSentimentDailySchema.index({ tenantId: 1, date: 1 });
BrandSentimentDailySchema.index({ tenantId: 1, entity: 1, date: 1 });
BrandSentimentDailySchema.index({ tenantId: 1, engine: 1, date: 1 });

const BrandSentimentDaily: Model<IBrandSentimentDaily> =
  mongoose.models.BrandSentimentDaily ||
  mongoose.model<IBrandSentimentDaily>(
    "BrandSentimentDaily",
    BrandSentimentDailySchema
  );

export default BrandSentimentDaily;
