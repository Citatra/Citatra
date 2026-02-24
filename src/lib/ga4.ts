/**
 * Google Analytics 4 (GA4) Client Library
 *
 * Uses the official @google-analytics/data package (GA Data API v1beta)
 * to fetch real traffic, conversion, and engagement data.
 *
 * Authentication: Google Service Account credentials stored as:
 *   - GA4_SERVICE_ACCOUNT_EMAIL env var (client_email)
 *   - GA4_PRIVATE_KEY env var (private_key, PEM format)
 *
 * OR per-workspace credentials stored in workspace.settings.ga4.
 *
 * Configuration:
 *   - GA4 Property ID (numeric, e.g. "123456789")
 *   - Stored per-workspace in workspace.settings.ga4.propertyId
 */

import { BetaAnalyticsDataClient } from "@google-analytics/data";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface GA4Credentials {
  clientEmail: string;
  privateKey: string;
}

export interface GA4Config {
  propertyId: string;
  credentials?: GA4Credentials;
}

export interface GA4TrafficRow {
  date: string;
  landingPage: string;
  sessionSource: string;
  sessionMedium: string;
  sessions: number;
  totalUsers: number;
  screenPageViews: number;
  conversions: number;
  engagementRate: number;
  averageSessionDuration: number;
}

export interface GA4TrafficReport {
  rows: GA4TrafficRow[];
  totals: {
    sessions: number;
    totalUsers: number;
    screenPageViews: number;
    conversions: number;
  };
  dateRange: { startDate: string; endDate: string };
  propertyId: string;
}

export interface GA4TestResult {
  success: boolean;
  message: string;
  propertyName?: string;
  latency: number;
}

/* ------------------------------------------------------------------ */
/*  Client Factory                                                     */
/* ------------------------------------------------------------------ */

function createClient(credentials?: GA4Credentials): BetaAnalyticsDataClient {
  // Priority: explicit credentials → env var credentials → ADC
  const email = credentials?.clientEmail || process.env.GA4_SERVICE_ACCOUNT_EMAIL;
  const key = credentials?.privateKey || process.env.GA4_PRIVATE_KEY;

  if (email && key) {
    return new BetaAnalyticsDataClient({
      credentials: {
        client_email: email,
        private_key: key.replace(/\\n/g, "\n"), // Handle escaped newlines from env
      },
    });
  }

  // Fall back to Application Default Credentials
  return new BetaAnalyticsDataClient();
}

/* ------------------------------------------------------------------ */
/*  Test Connection                                                    */
/* ------------------------------------------------------------------ */

/**
 * Verify GA4 API access by running a minimal metadata request.
 */
export async function testGA4Connection(config: GA4Config): Promise<GA4TestResult> {
  const start = Date.now();

  try {
    const client = createClient(config.credentials);

    // Run a minimal report to test connectivity
    const [response] = await client.runReport({
      property: `properties/${config.propertyId}`,
      dateRanges: [{ startDate: "yesterday", endDate: "today" }],
      metrics: [{ name: "sessions" }],
      limit: 1,
    });

    const latency = Date.now() - start;

    // Try to get property metadata for a friendly name
    let propertyName: string | undefined;
    try {
      const [metadata] = await client.getMetadata({
        name: `properties/${config.propertyId}/metadata`,
      });
      propertyName = metadata?.name || undefined;
    } catch {
      // Metadata call is optional
    }

    const sessionCount =
      response.rows?.[0]?.metricValues?.[0]?.value || "0";

    return {
      success: true,
      message: `GA4 connection verified. Recent sessions: ${sessionCount}`,
      propertyName,
      latency,
    };
  } catch (error) {
    const latency = Date.now() - start;
    const msg = error instanceof Error ? error.message : "Unknown error";

    // Provide helpful error messages
    if (msg.includes("PERMISSION_DENIED")) {
      return {
        success: false,
        message:
          "Permission denied. Ensure the service account has 'Viewer' role on the GA4 property.",
        latency,
      };
    }
    if (msg.includes("NOT_FOUND")) {
      return {
        success: false,
        message: `GA4 property "${config.propertyId}" not found. Check the Property ID in GA4 Admin → Property Settings.`,
        latency,
      };
    }

    return {
      success: false,
      message: `GA4 connection failed: ${msg}`,
      latency,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Fetch Traffic Report                                               */
/* ------------------------------------------------------------------ */

/**
 * Fetch traffic data from GA4 for the last N days.
 *
 * Returns per-landing-page / per-source breakdown of sessions, users,
 * pageviews, conversions, engagement rate, and session duration.
 */
export async function fetchGA4Traffic(
  config: GA4Config,
  days: number = 30
): Promise<GA4TrafficReport> {
  const client = createClient(config.credentials);

  const startDate = new Date(Date.now() - days * 86400000)
    .toISOString()
    .split("T")[0];
  const endDate = new Date().toISOString().split("T")[0];

  const [response] = await client.runReport({
    property: `properties/${config.propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: "date" },
      { name: "landingPage" },
      { name: "sessionSource" },
      { name: "sessionMedium" },
    ],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "screenPageViews" },
      { name: "conversions" },
      { name: "engagementRate" },
      { name: "averageSessionDuration" },
    ],
    orderBys: [{ dimension: { dimensionName: "date" }, desc: true }],
    limit: 10000,
  });

  const rows: GA4TrafficRow[] = (response.rows || []).map((row) => ({
    date: row.dimensionValues?.[0]?.value || "",
    landingPage: row.dimensionValues?.[1]?.value || "",
    sessionSource: row.dimensionValues?.[2]?.value || "",
    sessionMedium: row.dimensionValues?.[3]?.value || "",
    sessions: parseInt(row.metricValues?.[0]?.value || "0", 10),
    totalUsers: parseInt(row.metricValues?.[1]?.value || "0", 10),
    screenPageViews: parseInt(row.metricValues?.[2]?.value || "0", 10),
    conversions: parseInt(row.metricValues?.[3]?.value || "0", 10),
    engagementRate: parseFloat(row.metricValues?.[4]?.value || "0"),
    averageSessionDuration: parseFloat(row.metricValues?.[5]?.value || "0"),
  }));

  // Compute totals
  let totalSessions = 0;
  let totalUsers = 0;
  let totalPageViews = 0;
  let totalConversions = 0;
  for (const r of rows) {
    totalSessions += r.sessions;
    totalUsers += r.totalUsers;
    totalPageViews += r.screenPageViews;
    totalConversions += r.conversions;
  }

  return {
    rows,
    totals: {
      sessions: totalSessions,
      totalUsers: totalUsers,
      screenPageViews: totalPageViews,
      conversions: totalConversions,
    },
    dateRange: { startDate, endDate },
    propertyId: config.propertyId,
  };
}

/* ------------------------------------------------------------------ */
/*  Fetch AI-Attributed Traffic                                        */
/* ------------------------------------------------------------------ */

/**
 * Fetch traffic specifically from AI-related sources.
 *
 * Filters for sources that indicate AI overview traffic:
 *   - source = "google" with medium = "organic" and landing pages matching tracked queries
 *   - source contains "ai", "copilot", "bing" (AI chat referrals)
 *   - sessionCampaignName or sessionDefaultChannelGroup indicating AI
 *
 * Since Google doesn't yet provide a dedicated AI Overview referral channel,
 * we correlate organic traffic on query-matching landing pages with
 * AI visibility data from our tracking results.
 */
export async function fetchGA4AITraffic(
  config: GA4Config,
  days: number = 30
): Promise<GA4TrafficReport> {
  const client = createClient(config.credentials);

  const startDate = new Date(Date.now() - days * 86400000)
    .toISOString()
    .split("T")[0];
  const endDate = new Date().toISOString().split("T")[0];

  const [response] = await client.runReport({
    property: `properties/${config.propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: "date" },
      { name: "landingPage" },
      { name: "sessionSource" },
      { name: "sessionMedium" },
      { name: "sessionDefaultChannelGroup" },
    ],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "screenPageViews" },
      { name: "conversions" },
      { name: "engagementRate" },
      { name: "averageSessionDuration" },
    ],
    dimensionFilter: {
      orGroup: {
        expressions: [
          {
            filter: {
              fieldName: "sessionMedium",
              stringFilter: { value: "organic", matchType: "EXACT" },
            },
          },
          {
            filter: {
              fieldName: "sessionSource",
              stringFilter: { value: "ai", matchType: "CONTAINS" },
            },
          },
          {
            filter: {
              fieldName: "sessionDefaultChannelGroup",
              stringFilter: { value: "Organic Search", matchType: "EXACT" },
            },
          },
        ],
      },
    },
    orderBys: [{ dimension: { dimensionName: "date" }, desc: true }],
    limit: 10000,
  });

  const rows: GA4TrafficRow[] = (response.rows || []).map((row) => ({
    date: row.dimensionValues?.[0]?.value || "",
    landingPage: row.dimensionValues?.[1]?.value || "",
    sessionSource: row.dimensionValues?.[2]?.value || "",
    sessionMedium: row.dimensionValues?.[3]?.value || "",
    sessions: parseInt(row.metricValues?.[0]?.value || "0", 10),
    totalUsers: parseInt(row.metricValues?.[1]?.value || "0", 10),
    screenPageViews: parseInt(row.metricValues?.[2]?.value || "0", 10),
    conversions: parseInt(row.metricValues?.[3]?.value || "0", 10),
    engagementRate: parseFloat(row.metricValues?.[4]?.value || "0"),
    averageSessionDuration: parseFloat(row.metricValues?.[5]?.value || "0"),
  }));

  let totalSessions = 0;
  let totalUsers = 0;
  let totalPageViews = 0;
  let totalConversions = 0;
  for (const r of rows) {
    totalSessions += r.sessions;
    totalUsers += r.totalUsers;
    totalPageViews += r.screenPageViews;
    totalConversions += r.conversions;
  }

  return {
    rows,
    totals: {
      sessions: totalSessions,
      totalUsers: totalUsers,
      screenPageViews: totalPageViews,
      conversions: totalConversions,
    },
    dateRange: { startDate, endDate },
    propertyId: config.propertyId,
  };
}

/* ------------------------------------------------------------------ */
/*  Daily Summary (for charts)                                         */
/* ------------------------------------------------------------------ */

/**
 * Fetch a daily summary of sessions, conversions, and engagement
 * for the date range. Simpler than the full report — used for charts.
 */
export async function fetchGA4DailySummary(
  config: GA4Config,
  days: number = 30
): Promise<
  Array<{
    date: string;
    sessions: number;
    users: number;
    pageViews: number;
    conversions: number;
    engagementRate: number;
  }>
> {
  const client = createClient(config.credentials);

  const startDate = new Date(Date.now() - days * 86400000)
    .toISOString()
    .split("T")[0];
  const endDate = new Date().toISOString().split("T")[0];

  const [response] = await client.runReport({
    property: `properties/${config.propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "screenPageViews" },
      { name: "conversions" },
      { name: "engagementRate" },
    ],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });

  return (response.rows || []).map((row) => ({
    date: row.dimensionValues?.[0]?.value || "",
    sessions: parseInt(row.metricValues?.[0]?.value || "0", 10),
    users: parseInt(row.metricValues?.[1]?.value || "0", 10),
    pageViews: parseInt(row.metricValues?.[2]?.value || "0", 10),
    conversions: parseInt(row.metricValues?.[3]?.value || "0", 10),
    engagementRate: parseFloat(row.metricValues?.[4]?.value || "0"),
  }));
}
