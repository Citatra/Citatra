import mongoose, { Schema, Document, Model } from "mongoose";

/* ------------------------------------------------------------------ */
/*  ImplicitBacklinkEvidence                                            */
/*  Individual citation evidence — one row per citation occurrence.     */
/*  Links back to the TrackingResult that produced the citation.       */
/* ------------------------------------------------------------------ */

export interface IImplicitBacklinkEvidence extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;

  /** Canonical domain the citation came from */
  domain: string;

  /** Full URL that was cited */
  citedUrl: string;

  /** ID of the TrackingResult that contains this citation */
  trackingResultId: mongoose.Types.ObjectId;

  /** ID of the query/prompt that triggered the response */
  queryId: mongoose.Types.ObjectId;

  /** AI engine that produced this citation */
  engine: string;

  /** Excerpt / snippet surrounding the citation */
  excerpt: string;

  /** The prompt text (denormalized for display convenience) */
  promptText: string;

  /** Sentiment of the surrounding context */
  sentiment: "positive" | "neutral" | "negative";

  /** Was the brand mentioned in the same response? */
  brandMentioned: boolean;

  /** Position of the source in the response (1-based) */
  sourcePosition: number;

  /** Date the citation was first observed */
  firstSeen: Date;

  /** Date the citation was last observed */
  lastSeen: Date;

  createdAt: Date;
  updatedAt: Date;
}

const ImplicitBacklinkEvidenceSchema = new Schema<IImplicitBacklinkEvidence>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    domain: { type: String, required: true },
    citedUrl: { type: String, required: true },
    trackingResultId: {
      type: Schema.Types.ObjectId,
      ref: "TrackingResult",
      required: true,
    },
    queryId: { type: Schema.Types.ObjectId, ref: "Query", required: true },
    engine: { type: String, required: true },
    excerpt: { type: String, default: "" },
    promptText: { type: String, default: "" },
    sentiment: {
      type: String,
      enum: ["positive", "neutral", "negative"],
      default: "neutral",
    },
    brandMentioned: { type: Boolean, default: false },
    sourcePosition: { type: Number, default: 0 },
    firstSeen: { type: Date, required: true },
    lastSeen: { type: Date, required: true },
  },
  { timestamps: true }
);

// Uniqueness: one evidence row per tracking result + cited URL
ImplicitBacklinkEvidenceSchema.index(
  { tenantId: 1, trackingResultId: 1, citedUrl: 1 },
  { unique: true }
);
ImplicitBacklinkEvidenceSchema.index({ tenantId: 1, domain: 1 });
ImplicitBacklinkEvidenceSchema.index({ tenantId: 1, engine: 1 });
ImplicitBacklinkEvidenceSchema.index({ tenantId: 1, sentiment: 1 });
ImplicitBacklinkEvidenceSchema.index({ tenantId: 1, lastSeen: -1 });

const ImplicitBacklinkEvidence: Model<IImplicitBacklinkEvidence> =
  mongoose.models.ImplicitBacklinkEvidence ||
  mongoose.model<IImplicitBacklinkEvidence>(
    "ImplicitBacklinkEvidence",
    ImplicitBacklinkEvidenceSchema
  );

export default ImplicitBacklinkEvidence;
