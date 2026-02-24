import mongoose, { Schema, Document, Model } from "mongoose";

// ─── Domain Type Classification ─────────────────────────────────────────

export type SourceDomainType =
  | "corporate"
  | "editorial"
  | "institutional"
  | "ugc"
  | "reference"
  | "competitor"
  | "other";

export type SourceUrlType =
  | "homepage"
  | "category_page"
  | "product_page"
  | "listicle"
  | "comparison"
  | "profile"
  | "alternative"
  | "discussion"
  | "how_to_guide"
  | "article"
  | "other";

// ─── Source Document (URL-level) ────────────────────────────────────────

export interface ISource extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;

  /** The exact URL used as a source */
  url: string;
  /** Extracted root domain (e.g. "reddit.com") */
  domain: string;

  /** Auto-classified domain type */
  domainType: SourceDomainType;
  /** Auto-classified URL/page type */
  urlType: SourceUrlType;

  /** Page title extracted from the source */
  title: string;

  /** Total number of AI responses where this URL was used as a source */
  usedTotal: number;
  /** Total explicit citations of this URL across all responses */
  totalCitations: number;

  /** Brands/domains mentioned on this page */
  mentionedBrands: string[];

  /** Which AI engines referenced this source */
  engines: string[];

  /** Which query IDs referenced this source */
  queryIds: mongoose.Types.ObjectId[];

  /** Last time we saw this URL in an AI response */
  lastSeenAt: Date;
  /** Last time we fetched/analysed the URL content */
  lastFetchedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const SourceSchema = new Schema<ISource>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    url: { type: String, required: true },
    domain: { type: String, required: true },

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
    urlType: {
      type: String,
      enum: [
        "homepage",
        "category_page",
        "product_page",
        "listicle",
        "comparison",
        "profile",
        "alternative",
        "discussion",
        "how_to_guide",
        "article",
        "other",
      ],
      default: "other",
    },

    title: { type: String, default: "" },

    usedTotal: { type: Number, default: 0 },
    totalCitations: { type: Number, default: 0 },

    mentionedBrands: [{ type: String }],
    engines: [{ type: String }],
    queryIds: [{ type: Schema.Types.ObjectId, ref: "Query" }],

    lastSeenAt: { type: Date, required: true },
    lastFetchedAt: { type: Date },
  },
  { timestamps: true }
);

// Unique per workspace + URL
SourceSchema.index({ tenantId: 1, url: 1 }, { unique: true });
SourceSchema.index({ tenantId: 1, domain: 1 });
SourceSchema.index({ tenantId: 1, domainType: 1 });
SourceSchema.index({ tenantId: 1, usedTotal: -1 });

const Source: Model<ISource> =
  mongoose.models.Source ||
  mongoose.model<ISource>("Source", SourceSchema);

export default Source;
