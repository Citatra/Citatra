import mongoose, { Schema, Document, Model } from "mongoose";

/* ------------------------------------------------------------------ */
/*  Page — canonical page record with metadata & embeddings            */
/* ------------------------------------------------------------------ */

export type PageType =
  | "article"
  | "product"
  | "faq"
  | "homepage"
  | "category"
  | "landing"
  | "comparison"
  | "how-to"
  | "other";

export interface IPage extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId; // workspaceId

  /** Canonical URL (normalised, no session tokens) */
  canonicalUrl: string;

  /** Slug extracted from the URL path */
  slug: string;

  /** Page title */
  title: string;

  /** Auto-detected page type */
  pageType: PageType;

  /** Primary language (ISO 639-1) */
  language: string;

  /** Content length in characters (body text) */
  contentLength: number;

  /** Whether structured data (JSON-LD / microdata) was detected */
  hasStructuredData: boolean;

  /** Schema.org types detected (e.g. ["Article","FAQPage"]) */
  schemaTypes: string[];

  /** Named entities extracted from the page */
  entities: string[];

  /** Text embedding vector (sentence-transformer, 384-dim or similar) */
  embedding: number[];

  /** Canonical keywords / key phrases extracted */
  canonicalKeywords: string[];

  /** AI Visibility Score: weighted frequency of agent accesses (0–100) */
  aiVisibilityScore: number;

  /** Content Effectiveness Score: composite of visibility + content signals (0–100) */
  contentEffectivenessScore: number;

  /** Authority estimate (0–100), derived from external signals */
  authorityEstimate: number;

  /** Total agent requests observed for this page (denormalised counter) */
  totalAgentRequests: number;

  /** Per-engine agent request counts */
  engineRequestCounts: Record<string, number>;

  /** Last time any agent accessed this page */
  lastAgentAccessAt?: Date;

  /** Last time we analysed/re-embedded the page content */
  lastAnalysedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const PageSchema = new Schema<IPage>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    canonicalUrl: { type: String, required: true },
    slug: { type: String, default: "" },
    title: { type: String, default: "" },
    pageType: {
      type: String,
      enum: [
        "article",
        "product",
        "faq",
        "homepage",
        "category",
        "landing",
        "comparison",
        "how-to",
        "other",
      ],
      default: "other",
    },
    language: { type: String, default: "en" },
    contentLength: { type: Number, default: 0 },
    hasStructuredData: { type: Boolean, default: false },
    schemaTypes: [{ type: String }],
    entities: [{ type: String }],
    embedding: [{ type: Number }],
    canonicalKeywords: [{ type: String }],
    aiVisibilityScore: { type: Number, default: 0, min: 0, max: 100 },
    contentEffectivenessScore: { type: Number, default: 0, min: 0, max: 100 },
    authorityEstimate: { type: Number, default: 0, min: 0, max: 100 },
    totalAgentRequests: { type: Number, default: 0 },
    engineRequestCounts: { type: Schema.Types.Mixed, default: {} },
    lastAgentAccessAt: { type: Date },
    lastAnalysedAt: { type: Date },
  },
  { timestamps: true }
);

// Unique per workspace + canonical URL
PageSchema.index({ tenantId: 1, canonicalUrl: 1 }, { unique: true });
PageSchema.index({ tenantId: 1, slug: 1 });
PageSchema.index({ tenantId: 1, aiVisibilityScore: -1 });
PageSchema.index({ tenantId: 1, totalAgentRequests: -1 });
PageSchema.index({ tenantId: 1, pageType: 1 });

const Page: Model<IPage> =
  mongoose.models.Page || mongoose.model<IPage>("Page", PageSchema);

export default Page;
