import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICompetitor extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId; // workspaceId
  name: string; // display label, e.g. "Acme Corp"
  domain: string; // e.g. "acme.com"
  alternativeNames: string[]; // other brand names, e.g. ["Acme", "Acme Inc"]
  alternativeDomains: string[]; // other domains, e.g. ["acme.co.uk", "acme.de"]
  color?: string; // hex color for charts, e.g. "#ef4444"
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CompetitorSchema = new Schema<ICompetitor>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    name: { type: String, required: true },
    domain: { type: String, required: true },
    alternativeNames: { type: [String], default: [] },
    alternativeDomains: { type: [String], default: [] },
    color: { type: String, default: "#6b7280" },
    notes: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

CompetitorSchema.index({ tenantId: 1 });
CompetitorSchema.index({ tenantId: 1, domain: 1 }, { unique: true });

const Competitor: Model<ICompetitor> =
  mongoose.models.Competitor ||
  mongoose.model<ICompetitor>("Competitor", CompetitorSchema);

export default Competitor;
