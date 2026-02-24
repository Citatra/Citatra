/**
 * Shopify CMS Adapter
 *
 * Uses the Shopify Admin REST API (2024-01) for schema injection.
 * - Test: GET /admin/api/2024-01/shop.json to verify API access
 * - Push schema: POST /admin/api/2024-01/script_tags.json to create a ScriptTag
 *   that injects JSON-LD into the storefront.
 *
 * Authentication:
 *   - apiKey = Shopify Admin API access token (from a Custom App)
 *   - siteUrl = the Shopify store URL (e.g. https://my-store.myshopify.com)
 *
 * Requirements:
 *   1. A Custom App in Shopify admin with "read_script_tags, write_script_tags" scope
 *   2. The store must be on a plan that supports ScriptTag API
 */

const API_VERSION = "2024-01";

export interface ShopifyTestResult {
  success: boolean;
  message: string;
  latency: number;
  shopInfo?: {
    name: string;
    domain: string;
    email: string;
    plan: string;
  };
}

export interface ShopifyPushResult {
  success: boolean;
  message: string;
  details?: {
    scriptTagId: number;
    src?: string;
    statusCode: number;
  };
  error?: string;
}

function buildShopifyUrl(siteUrl: string): string {
  let base = siteUrl.replace(/\/+$/, "");
  // Ensure it's the admin domain
  if (!base.includes(".myshopify.com") && !base.includes("shopify.com")) {
    // Try to construct myshopify.com URL from store name
    const storeName = base.replace(/^https?:\/\//, "").split(".")[0];
    base = `https://${storeName}.myshopify.com`;
  }
  if (!base.startsWith("http")) {
    base = `https://${base}`;
  }
  return base;
}

function shopifyHeaders(apiKey: string): Record<string, string> {
  return {
    "X-Shopify-Access-Token": apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Test the Shopify Admin API connection.
 */
export async function testShopify(
  siteUrl: string,
  apiKey: string
): Promise<ShopifyTestResult> {
  const start = Date.now();
  const baseUrl = buildShopifyUrl(siteUrl);

  try {
    const res = await fetch(
      `${baseUrl}/admin/api/${API_VERSION}/shop.json`,
      {
        headers: shopifyHeaders(apiKey),
        signal: AbortSignal.timeout(10000),
      }
    );

    const latency = Date.now() - start;

    if (!res.ok) {
      return {
        success: false,
        message: `Shopify Admin API returned ${res.status}. Check your access token and store URL.`,
        latency,
      };
    }

    const data = await res.json();
    const shop = data.shop;

    return {
      success: true,
      message: `Shopify connection verified. Store: "${shop.name}"`,
      latency,
      shopInfo: {
        name: shop.name,
        domain: shop.domain,
        email: shop.email,
        plan: shop.plan_display_name || shop.plan_name || "unknown",
      },
    };
  } catch (error) {
    const latency = Date.now() - start;
    const msg = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: `Failed to reach Shopify: ${msg}`,
      latency,
    };
  }
}

/**
 * Push JSON-LD schema markup to a Shopify store.
 *
 * Strategy:
 *   1. Check for existing Citatra ScriptTag entries
 *   2. If found, delete the old one (ScriptTag doesn't support update-in-place for inline)
 *   3. Create a new ScriptTag that loads a hosted JSON-LD script
 *
 * Note: Shopify ScriptTag API only supports external URLs (src attribute), not inline scripts.
 * For inline JSON-LD injection, we use the Asset API to create a Liquid snippet instead.
 */
export async function pushSchemaShopify(
  siteUrl: string,
  apiKey: string,
  schemaData: string
): Promise<ShopifyPushResult> {
  const baseUrl = buildShopifyUrl(siteUrl);
  const headers = shopifyHeaders(apiKey);

  try {
    // Strategy: Use the Asset API to create/update a schema snippet in the theme
    // 1. Get the active theme
    const themesRes = await fetch(
      `${baseUrl}/admin/api/${API_VERSION}/themes.json`,
      { headers, signal: AbortSignal.timeout(10000) }
    );

    if (!themesRes.ok) {
      return {
        success: false,
        message: `Failed to fetch themes (${themesRes.status}). Ensure the token has "read_themes, write_themes" scope.`,
        error: await themesRes.text(),
      };
    }

    const { themes } = await themesRes.json();
    const activeTheme = themes.find(
      (t: { role: string }) => t.role === "main"
    );

    if (!activeTheme) {
      return {
        success: false,
        message: "Could not find the active (main) theme.",
      };
    }

    // 2. Create/update a Liquid snippet with the JSON-LD schema
    const snippetContent = `{% comment %}\n  Citatra Schema Markup - Auto-injected\n  Last updated: ${new Date().toISOString()}\n{% endcomment %}\n<script type="application/ld+json">\n${schemaData}\n</script>`;

    const assetRes = await fetch(
      `${baseUrl}/admin/api/${API_VERSION}/themes/${activeTheme.id}/assets.json`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          asset: {
            key: "snippets/citatra-schema.liquid",
            value: snippetContent,
          },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!assetRes.ok) {
      const errText = await assetRes.text();
      return {
        success: false,
        message: `Failed to create schema snippet (${assetRes.status}). Ensure the token has write_themes scope.`,
        error: errText.substring(0, 500),
        details: {
          scriptTagId: 0,
          statusCode: assetRes.status,
        },
      };
    }

    const assetData = await assetRes.json();

    return {
      success: true,
      message: `Schema snippet "citatra-schema.liquid" created/updated in theme "${activeTheme.name}". Add {% render 'citatra-schema' %} to your theme.liquid <head> to activate.`,
      details: {
        scriptTagId: activeTheme.id,
        src: assetData.asset?.key,
        statusCode: assetRes.status,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: `Failed to push schema to Shopify: ${msg}`,
      error: msg,
    };
  }
}
