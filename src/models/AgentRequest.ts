import mongoose, { Schema, Document, Model } from "mongoose";

/* ------------------------------------------------------------------ */
/*  Agent Request — raw events from AI engine crawlers/agents          */
/* ------------------------------------------------------------------ */

export type AgentEngine =
  | "chatgpt"
  | "gemini"
  | "perplexity"
  | "bing"
  | "claude"
  | "deepseek"
  | "meta"
  | "apple"
  | "unknown";

export type AgentPurpose = "index" | "real-time" | "training" | "preview" | "unknown";

export interface IAgentRequest extends Document {
  _id: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId; // workspaceId

  /** UTC timestamp of the request */
  timestamp: Date;

  /** Canonical URL that was accessed */
  canonicalUrl: string;
  /** Request path (raw, before canonicalization) */
  requestPath: string;

  /** Full User-Agent string */
  userAgent: string;
  /** Classified engine identifier */
  engine: AgentEngine;
  /** Purpose classification */
  agentPurpose: AgentPurpose;
  /** Classification confidence 0–1 */
  classificationConfidence: number;

  /** HTTP response status code */
  statusCode: number;
  /** Cache status (HIT / MISS / BYPASS etc.) */
  cacheStatus: string;
  /** Server response time in ms */
  responseTimeMs: number;

  /** Resolved IP address (anonymised — last octet zeroed for privacy) */
  ip: string;
  /** ISO 3166-1 alpha-2 country code from geo resolution */
  country: string;
  /** City from geo resolution */
  city: string;

  /** Referrer header if present */
  referrer: string;

  /** Raw request headers subset (PII-scrubbed) */
  headers: Record<string, string>;

  /** Ingestion source: "edge" | "middleware" | "log-upload" */
  ingestSource: string;

  createdAt: Date;
  updatedAt: Date;
}

const AgentRequestSchema = new Schema<IAgentRequest>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    timestamp: { type: Date, required: true },
    canonicalUrl: { type: String, required: true },
    requestPath: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    engine: {
      type: String,
      enum: [
        "chatgpt",
        "gemini",
        "perplexity",
        "bing",
        "claude",
        "deepseek",
        "meta",
        "apple",
        "unknown",
      ],
      default: "unknown",
    },
    agentPurpose: {
      type: String,
      enum: ["index", "real-time", "training", "preview", "unknown"],
      default: "unknown",
    },
    classificationConfidence: { type: Number, default: 0, min: 0, max: 1 },
    statusCode: { type: Number, default: 200 },
    cacheStatus: { type: String, default: "" },
    responseTimeMs: { type: Number, default: 0 },
    ip: { type: String, default: "" },
    country: { type: String, default: "" },
    city: { type: String, default: "" },
    referrer: { type: String, default: "" },
    headers: { type: Schema.Types.Mixed, default: {} },
    ingestSource: {
      type: String,
      enum: ["edge", "middleware", "log-upload"],
      default: "log-upload",
    },
  },
  { timestamps: true }
);

// Primary query indexes
AgentRequestSchema.index({ tenantId: 1, timestamp: -1 });
AgentRequestSchema.index({ tenantId: 1, canonicalUrl: 1, timestamp: -1 });
AgentRequestSchema.index({ tenantId: 1, engine: 1, timestamp: -1 });
AgentRequestSchema.index({ tenantId: 1, agentPurpose: 1 });

// TTL index — auto-delete raw events after 90 days for cost/compliance
AgentRequestSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

const AgentRequest: Model<IAgentRequest> =
  mongoose.models.AgentRequest ||
  mongoose.model<IAgentRequest>("AgentRequest", AgentRequestSchema);

export default AgentRequest;
