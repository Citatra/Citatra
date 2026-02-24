/**
 * CMS Provider Registry
 *
 * Unified interface for all CMS adapters (WordPress, Webflow, Shopify).
 * Provides a single entry point for test, push-schema operations.
 */

import { testWordPress, pushSchemaWordPress } from "./wordpress";
import { testWebflow, pushSchemaWebflow } from "./webflow";
import { testShopify, pushSchemaShopify } from "./shopify";

export type CmsPlatform = "wordpress" | "webflow" | "shopify";

export interface CmsTestResult {
  success: boolean;
  message: string;
  latency: number;
  siteInfo?: Record<string, unknown>;
}

export interface CmsPushResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  error?: string;
}

/**
 * Test a CMS connection using the appropriate adapter.
 */
export async function testCmsConnection(
  platform: CmsPlatform,
  siteUrl: string,
  apiKey: string
): Promise<CmsTestResult> {
  switch (platform) {
    case "wordpress": {
      const r = await testWordPress(siteUrl, apiKey);
      return { ...r, siteInfo: r.siteInfo as unknown as Record<string, unknown> };
    }
    case "webflow": {
      const r = await testWebflow(siteUrl, apiKey);
      return { ...r, siteInfo: r.siteInfo as unknown as Record<string, unknown> };
    }
    case "shopify": {
      const r = await testShopify(siteUrl, apiKey);
      return { ...r, siteInfo: r.shopInfo as unknown as Record<string, unknown> };
    }
    default:
      return {
        success: false,
        message: `Unsupported CMS platform: ${platform}`,
        latency: 0,
      };
  }
}

/**
 * Push JSON-LD schema markup to a CMS using the appropriate adapter.
 */
export async function pushSchemaToCms(
  platform: CmsPlatform,
  siteUrl: string,
  apiKey: string,
  schemaData: string
): Promise<CmsPushResult> {
  switch (platform) {
    case "wordpress": {
      const r = await pushSchemaWordPress(siteUrl, apiKey, schemaData);
      return { ...r, details: r.details as unknown as Record<string, unknown> };
    }
    case "webflow": {
      const r = await pushSchemaWebflow(siteUrl, apiKey, schemaData);
      return { ...r, details: r.details as unknown as Record<string, unknown> };
    }
    case "shopify": {
      const r = await pushSchemaShopify(siteUrl, apiKey, schemaData);
      return { ...r, details: r.details as unknown as Record<string, unknown> };
    }
    default:
      return {
        success: false,
        message: `Unsupported CMS platform: ${platform}`,
      };
  }
}

export { testWordPress, pushSchemaWordPress } from "./wordpress";
export { testWebflow, pushSchemaWebflow } from "./webflow";
export { testShopify, pushSchemaShopify } from "./shopify";
