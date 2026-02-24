/**
 * WordPress CMS Adapter
 *
 * Uses the WordPress REST API with Application Passwords authentication.
 * - Test: GET /wp-json/wp/v2/ to verify REST API accessibility
 * - Push schema: Creates/updates a reusable block (wp_block) containing JSON-LD,
 *   or falls back to updating page meta via custom fields.
 * - The apiKey field expects "username:application_password" format.
 *
 * Requirements on WordPress side:
 *   1. WordPress 5.6+ (Application Passwords built-in)
 *   2. REST API publicly accessible (not blocked by security plugin)
 *   3. User with "edit_posts" capability
 */

export interface WPTestResult {
  success: boolean;
  message: string;
  latency: number;
  siteInfo?: { name: string; description: string; url: string; version: string };
}

export interface WPPushResult {
  success: boolean;
  message: string;
  details?: {
    method: string;
    endpoint: string;
    statusCode: number;
    postId?: number;
  };
  error?: string;
}

function buildAuth(apiKey: string): string {
  // apiKey is "username:application_password"
  return "Basic " + Buffer.from(apiKey).toString("base64");
}

/**
 * Test the WordPress REST API connection.
 */
export async function testWordPress(
  siteUrl: string,
  apiKey: string
): Promise<WPTestResult> {
  const start = Date.now();
  const baseUrl = siteUrl.replace(/\/+$/, "");

  try {
    // First check unauthenticated REST API root
    const rootRes = await fetch(`${baseUrl}/wp-json/wp/v2/`, {
      headers: { Authorization: buildAuth(apiKey) },
      signal: AbortSignal.timeout(10000),
    });

    const latency = Date.now() - start;

    if (!rootRes.ok) {
      return {
        success: false,
        message: `WordPress REST API returned ${rootRes.status}. Ensure the REST API is enabled and not blocked.`,
        latency,
      };
    }

    // Try to get site info
    const infoRes = await fetch(`${baseUrl}/wp-json/`, {
      headers: { Authorization: buildAuth(apiKey) },
      signal: AbortSignal.timeout(10000),
    });

    let siteInfo: WPTestResult["siteInfo"];
    if (infoRes.ok) {
      const info = await infoRes.json();
      siteInfo = {
        name: info.name || "",
        description: info.description || "",
        url: info.url || baseUrl,
        version: info.namespaces?.includes("wp/v2") ? "v2" : "unknown",
      };
    }

    // Verify auth by checking current user
    const meRes = await fetch(`${baseUrl}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: buildAuth(apiKey) },
      signal: AbortSignal.timeout(10000),
    });

    if (!meRes.ok) {
      return {
        success: false,
        message:
          "REST API is reachable but authentication failed. Check your Application Password (format: username:password).",
        latency,
        siteInfo,
      };
    }

    return {
      success: true,
      message: "WordPress connection is healthy. REST API and authentication verified.",
      latency,
      siteInfo,
    };
  } catch (error) {
    const latency = Date.now() - start;
    const msg =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: `Failed to reach WordPress: ${msg}`,
      latency,
    };
  }
}

/**
 * Push JSON-LD schema markup to WordPress.
 *
 * Strategy:
 *   1. Search for an existing "citatra-schema" reusable block (wp_block).
 *   2. If found, update it. If not, create one.
 *   3. The block content wraps JSON-LD in a <!-- wp:html --> block so themes that
 *      use the REST API or the block editor can render it.
 *
 * For automatic injection into <head>, users should install a small must-use
 * plugin or theme snippet that reads the citatra-schema post and outputs it.
 */
export async function pushSchemaWordPress(
  siteUrl: string,
  apiKey: string,
  schemaData: string
): Promise<WPPushResult> {
  const baseUrl = siteUrl.replace(/\/+$/, "");
  const auth = buildAuth(apiKey);
  const headers = {
    Authorization: auth,
    "Content-Type": "application/json",
  };

  try {
    // Search for existing citatra schema block
    const searchRes = await fetch(
      `${baseUrl}/wp-json/wp/v2/blocks?search=citatra-schema&per_page=1`,
      { headers: { Authorization: auth }, signal: AbortSignal.timeout(10000) }
    );

    const jsonLdBlock = `<!-- wp:html -->\n<script type="application/ld+json">\n${schemaData}\n</script>\n<!-- /wp:html -->`;

    let method: string;
    let endpoint: string;
    let postId: number | undefined;

    if (searchRes.ok) {
      const blocks = await searchRes.json();
      if (Array.isArray(blocks) && blocks.length > 0) {
        // Update existing block
        postId = blocks[0].id;
        method = "PUT";
        endpoint = `${baseUrl}/wp-json/wp/v2/blocks/${postId}`;
      } else {
        // Create new block
        method = "POST";
        endpoint = `${baseUrl}/wp-json/wp/v2/blocks`;
      }
    } else {
      // Fallback: try creating a regular post with schema
      method = "POST";
      endpoint = `${baseUrl}/wp-json/wp/v2/posts`;
    }

    const body: Record<string, unknown> = {
      title: "citatra-schema",
      content: jsonLdBlock,
      status: "publish",
    };

    const pushRes = await fetch(endpoint, {
      method,
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!pushRes.ok) {
      const errText = await pushRes.text();
      return {
        success: false,
        message: `WordPress API returned ${pushRes.status}`,
        error: errText.substring(0, 500),
        details: { method, endpoint, statusCode: pushRes.status },
      };
    }

    const result = await pushRes.json();
    postId = result.id;

    return {
      success: true,
      message: `Schema markup ${method === "PUT" ? "updated" : "created"} successfully on WordPress.`,
      details: {
        method,
        endpoint,
        statusCode: pushRes.status,
        postId,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: `Failed to push schema to WordPress: ${msg}`,
      error: msg,
    };
  }
}
