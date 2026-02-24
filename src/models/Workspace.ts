import mongoose, { Schema, Document, Model } from "mongoose";

export interface IWorkspace extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  domain?: string;
  keywords: string[];
  timezone: string;
  ownerId: mongoose.Types.ObjectId;
  settings: {
    seoPreferences?: Record<string, unknown>;
    integrationTokens?: Record<string, string>;
    cmsConnections?: Array<{
      platform: string;
      status: string;
      siteUrl?: string;
      apiKey?: string;
      lastSync?: string;
      capabilities: string[];
    }>;
    ga4?: {
      propertyId?: string;
      clientEmail?: string;
      privateKey?: string;
      connected?: boolean;
      lastSync?: string;
    };
  };
  /** Brand name and aliases used for text-based mention detection in AI responses */
  brandNames: string[];
  /** Competitor domains tracked in this workspace (managed via Competitor model) */
  competitorDomains: string[];
  /** Search region for SERP API (e.g. "us", "gb", "de") */
  region: string;
  /** Search language (e.g. "en", "es", "de") */
  language: string;
  /** How often to auto-fetch: "daily", "twice_daily", "weekly" */
  updateFrequency: string;
  onboardingCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    domain: { type: String },
    keywords: [{ type: String }],
    timezone: { type: String, default: "UTC" },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    settings: {
      seoPreferences: { type: Schema.Types.Mixed, default: {} },
      integrationTokens: { type: Schema.Types.Mixed, default: {} },
      cmsConnections: { type: Schema.Types.Mixed, default: [] },
      ga4: { type: Schema.Types.Mixed, default: {} },
    },
    brandNames: [{ type: String }],
    competitorDomains: [{ type: String }],
    region: { type: String, default: "us" },
    language: { type: String, default: "en" },
    updateFrequency: { type: String, enum: ["daily", "twice_daily", "weekly"], default: "daily" },
    onboardingCompleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

WorkspaceSchema.index({ slug: 1 });
WorkspaceSchema.index({ ownerId: 1 });

const Workspace: Model<IWorkspace> =
  mongoose.models.Workspace ||
  mongoose.model<IWorkspace>("Workspace", WorkspaceSchema);

export default Workspace;
