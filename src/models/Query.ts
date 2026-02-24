import mongoose, { Schema, Document, Model } from "mongoose";

export type SupportedEngine = "google_ai_overview" | "bing_chat" | "perplexity" | "chatgpt";

export interface IQuery extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId; // workspaceId
  queryText: string;
  status: "active" | "inactive" | "suggested" | "paused" | "archived";
  /** Which AI engines to fetch for this query (defaults to ["google_ai_overview"]) */
  engines: SupportedEngine[];
  /** Optional monthly search volume (manually set or from keyword API) */
  searchVolume?: number;
  /** Topic grouping — like folders for organizing related prompts */
  topic?: string;
  /** Tags for cross-cutting categorization */
  tags: string[];
  /** ISO 3166-1 alpha-2 country code for prompt execution location */
  location: string;
  /** AI-estimated prompt volume score (1-5): relative demand for this prompt's topics */
  promptVolume?: number;
  /** When this prompt was suggested by the AI engine (null for manually created) */
  suggestedAt?: Date;
  lastFetchedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const QuerySchema = new Schema<IQuery>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    queryText: { type: String, required: true },
    status: {
      type: String,
      enum: ["active", "inactive", "suggested", "paused", "archived"],
      default: "active",
    },
    engines: {
      type: [String],
      enum: ["google_ai_overview", "bing_chat", "perplexity", "chatgpt"],
      default: ["google_ai_overview"],
    },
    searchVolume: { type: Number, default: 0 },
    topic: { type: String, default: "" },
    tags: { type: [String], default: [] },
    location: { type: String, default: "us" },
    promptVolume: { type: Number, min: 1, max: 5 },
    suggestedAt: { type: Date },
    lastFetchedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

QuerySchema.index({ tenantId: 1 });
QuerySchema.index({ tenantId: 1, queryText: 1 });
QuerySchema.index({ tenantId: 1, status: 1 });
QuerySchema.index({ tenantId: 1, topic: 1 });

const Query: Model<IQuery> =
  mongoose.models.Query || mongoose.model<IQuery>("Query", QuerySchema);

export default Query;
