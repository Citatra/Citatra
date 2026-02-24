import mongoose, { Schema, Document, Model } from "mongoose";

export type AnalysisType = "html-audit" | "schema-generator" | "semantic-map" | "geo-audit";

export interface IPageAnalysis extends Document {
  _id: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  analysisType: AnalysisType;
  url: string;
  /** Full raw result from the analysis API */
  result: Record<string, unknown>;
  /** Lightweight summary for the table view */
  summary: {
    score?: number;
    errors?: number;
    warnings?: number;
    infos?: number;
    totalIssues?: number;
    schemaCount?: number;
    schemaTypes?: string[];
    entityCount?: number;
    topicCount?: number;
    topicsMissing?: number;
    pageTitle?: string;
  };
  status: "success" | "failed";
  errorMessage?: string;
  analyzedAt: Date;
}

const PageAnalysisSchema = new Schema<IPageAnalysis>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    analysisType: {
      type: String,
      enum: ["html-audit", "schema-generator", "semantic-map", "geo-audit"],
      required: true,
    },
    url: { type: String, required: true },
    result: { type: Schema.Types.Mixed, default: {} },
    summary: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ["success", "failed"], default: "success" },
    errorMessage: { type: String },
    analyzedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

PageAnalysisSchema.index({ workspaceId: 1, analysisType: 1, analyzedAt: -1 });
PageAnalysisSchema.index({ workspaceId: 1, analysisType: 1, url: 1 }, { unique: true });

const PageAnalysis: Model<IPageAnalysis> =
  mongoose.models.PageAnalysis ||
  mongoose.model<IPageAnalysis>("PageAnalysis", PageAnalysisSchema);

export default PageAnalysis;
