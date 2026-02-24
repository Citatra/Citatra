import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";

export const runtime = "nodejs";

/**
 * POST /api/workspaces/[workspaceId]/schema-generator
 *
 * Automated Schema Injection — analyzes content and generates
 * JSON-LD structured data for FAQ, Article, Product, HowTo types.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId } = await params;
    await connectToDatabase();

    const membership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { url, contentType, content } = body as {
      url?: string;
      contentType: "faq" | "article" | "product" | "howto" | "localbusiness" | "auto";
      content?: {
        title?: string;
        description?: string;
        author?: string;
        datePublished?: string;
        faqs?: { question: string; answer: string }[];
        steps?: { name: string; text: string; image?: string }[];
        productName?: string;
        price?: string;
        currency?: string;
        availability?: string;
        brand?: string;
        image?: string;
        // LocalBusiness fields
        businessName?: string;
        streetAddress?: string;
        city?: string;
        state?: string;
        postalCode?: string;
        country?: string;
        phone?: string;
        email?: string;
        businessUrl?: string;
        openingHours?: string[];
        latitude?: number;
        longitude?: number;
        priceRange?: string;
      };
    };

    let html = "";
    let pageTitle = "";
    if (url) {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Citatra-Bot/1.0" },
          signal: AbortSignal.timeout(10000),
        });
        html = await res.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        pageTitle = titleMatch?.[1]?.trim() || "";
      } catch {
        return NextResponse.json({ error: "Failed to fetch URL" }, { status: 400 });
      }
    }

    const schemas: { type: string; jsonLd: Record<string, unknown> }[] = [];
    const detectedType = contentType === "auto" ? detectContentType(html) : contentType;

    // FAQ Schema
    if (detectedType === "faq" || contentType === "auto") {
      const faqs = content?.faqs || extractFAQs(html);
      if (faqs.length > 0) {
        schemas.push({
          type: "FAQPage",
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((faq) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: faq.answer,
              },
            })),
          },
        });
      }
    }

    // Article Schema
    if (detectedType === "article" || contentType === "auto") {
      schemas.push({
        type: "Article",
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: content?.title || pageTitle || "Untitled",
          description: content?.description || extractMetaDescription(html) || "",
          author: content?.author
            ? { "@type": "Person", name: content.author }
            : undefined,
          datePublished: content?.datePublished || extractDate(html) || undefined,
          image: content?.image || extractOGImage(html) || undefined,
          mainEntityOfPage: url || undefined,
        },
      });
    }

    // Product Schema
    if (detectedType === "product") {
      schemas.push({
        type: "Product",
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "Product",
          name: content?.productName || content?.title || pageTitle || "Product",
          description: content?.description || "",
          brand: content?.brand ? { "@type": "Brand", name: content.brand } : undefined,
          image: content?.image || extractOGImage(html) || undefined,
          offers: {
            "@type": "Offer",
            price: content?.price || "",
            priceCurrency: content?.currency || "USD",
            availability: content?.availability || "https://schema.org/InStock",
          },
        },
      });
    }

    // LocalBusiness Schema
    if (detectedType === "localbusiness" || contentType === "localbusiness") {
      const biz: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        name: content?.businessName || content?.title || pageTitle || "Business Name",
        description: content?.description || extractMetaDescription(html) || "",
        url: content?.businessUrl || url || undefined,
        image: content?.image || extractOGImage(html) || undefined,
        telephone: content?.phone || extractPhone(html) || undefined,
        email: content?.email || undefined,
        priceRange: content?.priceRange || undefined,
      };

      // Address
      if (content?.streetAddress || content?.city) {
        biz.address = {
          "@type": "PostalAddress",
          streetAddress: content?.streetAddress || "",
          addressLocality: content?.city || "",
          addressRegion: content?.state || "",
          postalCode: content?.postalCode || "",
          addressCountry: content?.country || "US",
        };
      } else {
        // Try to extract address from page
        const addressData = extractAddress(html);
        if (addressData) biz.address = addressData;
      }

      // Geo coordinates
      if (content?.latitude && content?.longitude) {
        biz.geo = {
          "@type": "GeoCoordinates",
          latitude: content.latitude,
          longitude: content.longitude,
        };
      }

      // Opening hours
      if (content?.openingHours && content.openingHours.length > 0) {
        biz.openingHours = content.openingHours;
      }

      schemas.push({ type: "LocalBusiness", jsonLd: biz });
    }

    // HowTo Schema
    if (detectedType === "howto") {
      const steps = content?.steps || extractSteps(html);
      if (steps.length > 0) {
        schemas.push({
          type: "HowTo",
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "HowTo",
            name: content?.title || pageTitle || "How To Guide",
            description: content?.description || "",
            step: steps.map((s, i) => ({
              "@type": "HowToStep",
              position: i + 1,
              name: s.name,
              text: s.text,
              image: s.image || undefined,
            })),
          },
        });
      }
    }

    // Generate HTML snippet
    const htmlSnippets = schemas.map(
      (s) =>
        `<script type="application/ld+json">\n${JSON.stringify(s.jsonLd, null, 2)}\n</script>`
    );

    return NextResponse.json({
      detectedType,
      schemas,
      htmlSnippets,
      validation: schemas.map((s) => ({
        type: s.type,
        valid: validateSchema(s.jsonLd),
        warnings: getSchemaWarnings(s),
      })),
    });
  } catch (error) {
    console.error("Schema generator error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function detectContentType(html: string): string {
  const lower = html.toLowerCase();
  // LocalBusiness signals
  if (
    (lower.includes("localbusiness") || lower.includes("local_business")) ||
    (lower.includes("opening hours") && (lower.includes("address") || lower.includes("phone"))) ||
    (lower.includes("directions") && lower.includes("hours") && lower.includes("call"))
  ) {
    return "localbusiness";
  }
  if (lower.includes("faq") || (lower.match(/\?/g) || []).length > 5) return "faq";
  if (lower.includes("step-by-step") || lower.includes("how to") || lower.includes("howto")) return "howto";
  if (lower.includes("add to cart") || lower.includes("price") || lower.includes("product")) return "product";
  return "article";
}

function extractFAQs(html: string): { question: string; answer: string }[] {
  const faqs: { question: string; answer: string }[] = [];
  // Look for Q&A patterns in headings
  const pattern = /<h[2-4][^>]*>(.*?\?)<\/h[2-4]>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null && faqs.length < 10) {
    const q = match[1].replace(/<[^>]+>/g, "").trim();
    const a = match[2].replace(/<[^>]+>/g, "").trim();
    if (q && a) faqs.push({ question: q, answer: a });
  }
  return faqs;
}

function extractSteps(html: string): { name: string; text: string; image?: string }[] {
  const steps: { name: string; text: string }[] = [];
  const pattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null && steps.length < 20) {
    const text = match[1].replace(/<[^>]+>/g, "").trim();
    if (text.length > 10) {
      steps.push({ name: `Step ${steps.length + 1}`, text });
    }
  }
  return steps;
}

function extractMetaDescription(html: string): string {
  const match = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  return match?.[1] || "";
}

function extractOGImage(html: string): string {
  const match = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  return match?.[1] || "";
}

function extractDate(html: string): string {
  const match = html.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] || "";
}

function extractPhone(html: string): string {
  const match = html.match(/(?:tel:|phone|call)[^\d]*(\+?[\d\s\-().]{7,20})/i);
  return match?.[1]?.trim() || "";
}

function extractAddress(html: string): Record<string, unknown> | null {
  // Try microdata / itemprop
  const street = html.match(/itemprop=["']streetAddress["'][^>]*>([^<]+)/i)?.[1]?.trim();
  const city = html.match(/itemprop=["']addressLocality["'][^>]*>([^<]+)/i)?.[1]?.trim();
  if (street || city) {
    return {
      "@type": "PostalAddress",
      streetAddress: street || "",
      addressLocality: city || "",
      addressRegion: html.match(/itemprop=["']addressRegion["'][^>]*>([^<]+)/i)?.[1]?.trim() || "",
      postalCode: html.match(/itemprop=["']postalCode["'][^>]*>([^<]+)/i)?.[1]?.trim() || "",
      addressCountry: html.match(/itemprop=["']addressCountry["'][^>]*>([^<]+)/i)?.[1]?.trim() || "US",
    };
  }
  return null;
}

function validateSchema(jsonLd: Record<string, unknown>): boolean {
  return !!(jsonLd["@context"] && jsonLd["@type"]);
}

function getSchemaWarnings(s: { type: string; jsonLd: Record<string, unknown> }): string[] {
  const warns: string[] = [];
  if (s.type === "Article") {
    if (!s.jsonLd.author) warns.push("Missing author — add author for better validation.");
    if (!s.jsonLd.datePublished) warns.push("Missing datePublished — recommended for Article schema.");
    if (!s.jsonLd.image) warns.push("Missing image — articles with images get better rich results.");
  }
  if (s.type === "Product") {
    const offers = s.jsonLd.offers as Record<string, unknown> | undefined;
    if (!offers?.price) warns.push("Missing price in offers — required for Product rich results.");
  }
  if (s.type === "FAQPage") {
    const entities = s.jsonLd.mainEntity as unknown[];
    if (!entities || entities.length < 2) warns.push("Add at least 2 FAQ items for better visibility.");
  }
  if (s.type === "LocalBusiness") {
    if (!s.jsonLd.telephone) warns.push("Missing telephone — strongly recommended for local search.");
    if (!s.jsonLd.address) warns.push("Missing address — required for local SEO visibility.");
    if (!s.jsonLd.geo) warns.push("Missing geo coordinates — adding latitude/longitude improves Maps results.");
    if (!s.jsonLd.openingHours) warns.push("Missing opening hours — adding them improves knowledge panel.");
    if (!s.jsonLd.priceRange) warns.push("Missing priceRange — helps users evaluate the business.");
  }
  return warns;
}
