import mongoose, { Schema, Document, Model } from "mongoose";

/* ------------------------------------------------------------------ */
/*  AttributionModelMetrics                                             */
/*  Tracks model quality per workspace for monitoring & drift alerts.  */
/* ------------------------------------------------------------------ */

export interface IAttributionModelMetrics extends Document {
  _id: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;

  /** Semantic model version string (e.g. "v1.0", "v1.1-retrain") */
  modelVersion: string;

  /** Date the metrics were computed */
  date: string;

  /** Root-mean-square error of predictions vs GA4 actuals */
  rmse: number;

  /** Average signed error (positive = over-predicting) */
  bias: number;

  /** Number of labeled samples used for evaluation */
  sampleSize: number;

  /** R² score */
  r2: number;

  /** Mean absolute error */
  mae: number;

  /** Free-form notes */
  notes: string;

  /** Whether drift was detected */
  driftDetected: boolean;

  createdAt: Date;
}

const AttributionModelMetricsSchema = new Schema<IAttributionModelMetrics>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    modelVersion: { type: String, required: true },
    date: { type: String, required: true },
    rmse: { type: Number, default: 0 },
    bias: { type: Number, default: 0 },
    sampleSize: { type: Number, default: 0 },
    r2: { type: Number, default: 0 },
    mae: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    driftDetected: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AttributionModelMetricsSchema.index(
  { workspaceId: 1, modelVersion: 1, date: 1 },
  { unique: true }
);
AttributionModelMetricsSchema.index({ workspaceId: 1, date: -1 });

const AttributionModelMetrics: Model<IAttributionModelMetrics> =
  mongoose.models.AttributionModelMetrics ||
  mongoose.model<IAttributionModelMetrics>(
    "AttributionModelMetrics",
    AttributionModelMetricsSchema
  );

export default AttributionModelMetrics;
