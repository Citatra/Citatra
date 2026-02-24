/**
 * Webflow CMS Adapter
 *
 * Uses the Webflow API v2 (https://developers.webflow.com/data/reference).
 * - Test: GET /v2/token/authorized_by to verify the API token
 * - Push schema: PATCH /v2/sites/{siteId}/custom_code to inject JSON-LD into <head>
 * - apiKey = Webflow site API token (Bearer token)
 * - siteUrl = the Webflow site URL (used to find the site ID, or can be the site ID itself)
 *
 * Requirements:
 *   1. A Webflow API token with "sites:read" and "custom_code:write" scopes
 *   2. The site must be on a CMS or Business plan for custom code injection
 */

const WEBFLOW_API = "https://api.webflow.com";

export interface WebflowTestResult {
  success: boolean;
  message: string;
  latency: number;
  siteInfo?: { siteId: string; displayName: string; shortName: string };
}

export interface WebflowPushResult {
  success: boolean;
  message: string;
  details?: { siteId: string; statusCode: number };
  error?: string;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Resolve a Webflow site ID from a URL or direct ID.
 * Lists all sites the token has access to and matches by shortName or customDomain.
 */
async function resolveSiteId(
  siteUrl: string,
  apiKey: string
): Promise<{ siteId: string; displayName: string; shortName: string } | null> {
  // If siteUrl looks like a Webflow site ID (24-char hex), use it directly
  if (/^[0-9a-f]{24}$/i.test(siteUrl.trim())) {
    return { siteId: siteUrl.trim(), displayName: siteUrl.trim(), shortName: siteUrl.trim() };
  }

  const res = await fetch(`${WEBFLOW_API}/v2/sites`, {
    headers: authHeaders(apiKey),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const sites = data.sites || data;

  if (!Array.isArray(sites)) return null;

  // Normalize the input URL for matching
  const normalized = siteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();

  for (const site of sites) {
    const shortName = (site.shortName || site.name || "").toLowerCase();
    const customDomains: string[] = site.customDomains || [];
    const defaultDomain = `${shortName}.webflow.io`;

    if (
      normalized === defaultDomain ||
      normalized === shortName ||
      customDomains.some(
        (d: string) => normalized === d.toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "")
      ) ||
      normalized.includes(shortName)
    ) {
      return {
        siteId: site._id || site.id,
        displayName: site.displayName || site.name || shortName,
        shortName,
      };
    }
  }

  // If only one site, use it
  if (sites.length === 1) {
    const s = sites[0];
    return {
      siteId: s._id || s.id,
      displayName: s.displayName || s.name || "",
      shortName: s.shortName || s.name || "",
    };
  }

  return null;
}

/**
 * Test the Webflow API connection.
 */
export async function testWebflow(
  siteUrl: string,
  apiKey: string
): Promise<WebflowTestResult> {
  const start = Date.now();

  try {
    // Verify the token
    const authRes = await fetch(`${WEBFLOW_API}/v2/token/authorized_by`, {
      headers: authHeaders(apiKey),
      signal: AbortSignal.timeout(10000),
    });

    const latency = Date.now() - start;

    if (!authRes.ok) {
      return {
        success: false,
        message: `Webflow API returned ${authRes.status}. Check your API token and scopes.`,
        latency,
      };
    }

    // Try to resolve the site
    const site = await resolveSiteId(siteUrl, apiKey);
    if (!site) {
      return {
        success: false,
        message:
          "API token is valid but could not find a matching Webflow site. Verify the site URL matches one of your Webflow sites.",
        latency,
      };
    }

    return {
      success: true,
      message: `Webflow connection verified. Site: "${site.displayName}"`,
      latency,
      siteInfo: site,
    };
  } catch (error) {
    const latency = Date.now() - start;
    const msg = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: `Failed to reach Webflow API: ${msg}`,
      latency,
    };
  }
}

/**
 * Push JSON-LD schema markup to a Webflow site's <head> custom code.
 *
 * Uses the Webflow Custom Code API:
 *   PUT /v2/sites/{siteId}/custom_code
 *
 * This registers a script in the site's <head> across all pages.
 * Note: Requires the "custom_code:write" scope on the API token.
 */
export async function pushSchemaWebflow(
  siteUrl: string,
  apiKey: string,
  schemaData: string
): Promise<WebflowPushResult> {
  try {
    const site = await resolveSiteId(siteUrl, apiKey);
    if (!site) {
      return {
        success: false,
        message: "Could not resolve Webflow site ID from the provided URL.",
      };
    }

    const scriptContent = `<script type="application/ld+json">\n${schemaData}\n</script>`;

    // Register a custom code block in the site head
    // Webflow API v2 custom code endpoint
    const res = await fetch(
      `${WEBFLOW_API}/v2/sites/${site.siteId}/custom_code`,
      {
        method: "PUT",
        headers: authHeaders(apiKey),
        body: JSON.stringify({
          headCode: scriptContent,
          // Keep any existing body code
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) {
      // Fallback: try the registered scripts approach
      const registerRes = await fetch(
        `${WEBFLOW_API}/v2/sites/${site.siteId}/registered_scripts/inline`,
        {
          method: "POST",
          headers: authHeaders(apiKey),
          body: JSON.stringify({
            sourceCode: scriptContent,
            version: new Date().toISOString().split("T")[0],
            displayName: "Citatra Schema Markup",
          }),
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!registerRes.ok) {
        const errText = await registerRes.text();
        return {
          success: false,
          message: `Webflow custom code API returned ${registerRes.status}. Ensure your plan supports custom code and the token has "custom_code:write" scope.`,
          error: errText.substring(0, 500),
          details: { siteId: site.siteId, statusCode: registerRes.status },
        };
      }

      return {
        success: true,
        message: `Schema markup registered as inline script on "${site.displayName}". Publish the site to activate.`,
        details: { siteId: site.siteId, statusCode: registerRes.status },
      };
    }

    return {
      success: true,
      message: `Schema markup injected into <head> of "${site.displayName}". Publish the site to activate.`,
      details: { siteId: site.siteId, statusCode: res.status },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: `Failed to push schema to Webflow: ${msg}`,
      error: msg,
    };
  }
}
