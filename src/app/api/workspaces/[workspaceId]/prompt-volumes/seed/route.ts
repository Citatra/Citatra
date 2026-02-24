import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import PromptVolume from "@/models/PromptVolume";
import Membership from "@/models/Membership";

export const runtime = "nodejs";

// POST /api/workspaces/[workspaceId]/prompt-volumes/seed
// Generate demo data for the Prompt Volumes feature
export async function POST(
  _req: Request,
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
    if (!membership || membership.role === "viewer") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check if data already exists
    const existing = await PromptVolume.countDocuments({ tenantId: workspaceId });
    if (existing > 0) {
      return NextResponse.json({
        message: `${existing} topics already exist. Delete them first to re-seed.`,
        count: existing,
      });
    }

    const engines = ["chatgpt", "gemini", "claude", "perplexity"] as const;
    const regions = ["US", "UK", "CA", "DE", "FR", "BR", "AU", "KR", "ES", "IT"] as const;
    const intents = ["informational", "transactional", "navigational", "follow-up"] as const;
    const sentiments = ["positive", "negative", "neutral", "mixed"] as const;
    const confidences = ["high", "medium", "low"] as const;

    const sampleTopics = [
      {
        topic: "best running shoes 2026",
        exemplars: [
          "What are the best running shoes for beginners in 2026?",
          "Compare top running shoes this year",
          "Which running shoe brand is most recommended by AI?",
        ],
        volume: 45200,
        intent: "transactional",
        sentiment: "neutral",
        trending: true,
        direction: "rising",
        wow: 23.5,
      },
      {
        topic: "how to meal prep for weight loss",
        exemplars: [
          "Help me create a meal prep plan for losing weight",
          "What are easy meal prep ideas for a calorie deficit?",
          "Weekly meal prep guide for weight loss",
        ],
        volume: 38900,
        intent: "informational",
        sentiment: "positive",
        trending: true,
        direction: "rising",
        wow: 15.2,
      },
      {
        topic: "AI tools for small business",
        exemplars: [
          "What AI tools should a small business use?",
          "Best free AI tools for startups",
          "How can AI help my small business grow?",
        ],
        volume: 67300,
        intent: "informational",
        sentiment: "positive",
        trending: true,
        direction: "rising",
        wow: 42.1,
      },
      {
        topic: "explain quantum computing simply",
        exemplars: [
          "Can you explain quantum computing like I'm five?",
          "What is quantum computing in simple terms?",
          "How does quantum computing differ from regular computing?",
        ],
        volume: 29100,
        intent: "informational",
        sentiment: "neutral",
        trending: false,
        direction: "stable",
        wow: 2.3,
      },
      {
        topic: "best budget smartphones 2026",
        exemplars: [
          "What's the best phone under $300 in 2026?",
          "Compare budget smartphones this year",
          "Which cheap phone has the best camera?",
        ],
        volume: 52400,
        intent: "transactional",
        sentiment: "neutral",
        trending: false,
        direction: "falling",
        wow: -8.4,
      },
      {
        topic: "home workout routines no equipment",
        exemplars: [
          "Give me a home workout that needs no equipment",
          "Best bodyweight exercises for building muscle at home",
          "30-minute home workout plan without weights",
        ],
        volume: 41700,
        intent: "informational",
        sentiment: "positive",
        trending: false,
        direction: "stable",
        wow: 1.1,
      },
      {
        topic: "how to write a resignation letter",
        exemplars: [
          "Write me a professional resignation letter",
          "What should I include in a resignation email?",
          "Resignation letter template for giving two weeks notice",
        ],
        volume: 31500,
        intent: "transactional",
        sentiment: "neutral",
        trending: false,
        direction: "stable",
        wow: -0.5,
      },
      {
        topic: "climate change latest research",
        exemplars: [
          "What does the latest research say about climate change?",
          "How fast is global warming progressing in 2026?",
          "Most important climate change studies this year",
        ],
        volume: 26800,
        intent: "informational",
        sentiment: "negative",
        trending: true,
        direction: "rising",
        wow: 18.7,
      },
      {
        topic: "learn coding from scratch",
        exemplars: [
          "What's the best programming language to learn first?",
          "How should I start learning to code as a complete beginner?",
          "Free resources to learn programming in 2026",
        ],
        volume: 58200,
        intent: "informational",
        sentiment: "positive",
        trending: false,
        direction: "stable",
        wow: 3.4,
      },
      {
        topic: "best electric vehicles range",
        exemplars: [
          "Which electric car has the longest range in 2026?",
          "Compare EV range for under $40,000",
          "Best electric vehicles for long road trips",
        ],
        volume: 43600,
        intent: "transactional",
        sentiment: "positive",
        trending: true,
        direction: "rising",
        wow: 31.2,
      },
      {
        topic: "personal finance tips for millennials",
        exemplars: [
          "How should millennials invest their money?",
          "Best savings strategies for people in their 30s",
          "Financial planning advice for millennials",
        ],
        volume: 35400,
        intent: "informational",
        sentiment: "neutral",
        trending: false,
        direction: "falling",
        wow: -4.2,
      },
      {
        topic: "compare streaming services 2026",
        exemplars: [
          "Which streaming service has the best content right now?",
          "Netflix vs Disney+ vs Max comparison",
          "Is YouTube Premium worth it compared to other streaming services?",
        ],
        volume: 47800,
        intent: "navigational",
        sentiment: "neutral",
        trending: false,
        direction: "stable",
        wow: 0.8,
      },
      {
        topic: "natural remedies for anxiety",
        exemplars: [
          "What natural supplements help with anxiety?",
          "How to reduce anxiety without medication",
          "Best herbal remedies for stress and anxiety",
        ],
        volume: 39200,
        intent: "informational",
        sentiment: "mixed",
        trending: false,
        direction: "stable",
        wow: 2.1,
      },
      {
        topic: "how does GPT work internally",
        exemplars: [
          "Explain how GPT models generate text",
          "What architecture does ChatGPT use?",
          "How are large language models trained?",
        ],
        volume: 22100,
        intent: "informational",
        sentiment: "neutral",
        trending: false,
        direction: "falling",
        wow: -12.3,
      },
      {
        topic: "sustainable fashion brands",
        exemplars: [
          "What are the most sustainable clothing brands?",
          "Where to buy ethical fashion online",
          "Best eco-friendly fashion brands 2026",
        ],
        volume: 28700,
        intent: "transactional",
        sentiment: "positive",
        trending: true,
        direction: "rising",
        wow: 19.8,
      },
      {
        topic: "remote work productivity tips",
        exemplars: [
          "How to stay productive working from home",
          "Best tools for remote work productivity",
          "Tips for managing time as a remote worker",
        ],
        volume: 33100,
        intent: "informational",
        sentiment: "positive",
        trending: false,
        direction: "falling",
        wow: -6.1,
      },
      {
        topic: "immigration policy changes",
        exemplars: [
          "What are the latest immigration policy changes?",
          "How do new visa rules affect work permits?",
          "Immigration reform updates 2026",
        ],
        volume: 19500,
        intent: "informational",
        sentiment: "mixed",
        trending: true,
        direction: "rising",
        wow: 55.3,
      },
      {
        topic: "best dog food for puppies",
        exemplars: [
          "What's the healthiest food for a new puppy?",
          "Compare puppy food brands",
          "Grain-free vs regular puppy food",
        ],
        volume: 24300,
        intent: "transactional",
        sentiment: "positive",
        trending: false,
        direction: "stable",
        wow: 1.5,
      },
      {
        topic: "JavaScript vs Python for beginners",
        exemplars: [
          "Should I learn JavaScript or Python first?",
          "Which language is better for a beginner: JS or Python?",
          "Compare Python and JavaScript for web development",
        ],
        volume: 36800,
        intent: "informational",
        sentiment: "neutral",
        trending: false,
        direction: "stable",
        wow: -1.0,
      },
      {
        topic: "how AI will change healthcare",
        exemplars: [
          "What impact will AI have on healthcare?",
          "How is artificial intelligence being used in medicine?",
          "Will AI replace doctors in the future?",
        ],
        volume: 42500,
        intent: "informational",
        sentiment: "mixed",
        trending: true,
        direction: "rising",
        wow: 28.9,
      },
    ];

    // Generate trend data (12 weeks of history)
    function generateTrendData(baseVolume: number, direction: string) {
      const points = [];
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i * 7);
        const factor =
          direction === "rising"
            ? 0.7 + (0.3 * (12 - i)) / 12
            : direction === "falling"
            ? 1.3 - (0.3 * (12 - i)) / 12
            : 1;
        const noise = 0.9 + Math.random() * 0.2;
        const volume = Math.round(baseVolume * factor * noise);
        const prevVol: number = i < 11 ? (points[points.length - 1]?.volume ?? volume) : volume;
        const pctDelta: number = prevVol > 0 ? ((volume - prevVol) / prevVol) * 100 : 0;
        points.push({ date, volume, delta: Math.round(pctDelta * 10) / 10 });
      }
      return points;
    }

    function generateEngineBreakdown(totalVolume: number) {
      const shares = [
        35 + Math.random() * 15, // ChatGPT
        20 + Math.random() * 10, // Gemini
        10 + Math.random() * 10, // Claude
        5 + Math.random() * 10,  // Perplexity
      ];
      const totalShare = shares.reduce((a, b) => a + b, 0);
      return engines.map((engine, i) => ({
        engine,
        volume: Math.round(totalVolume * (shares[i] / totalShare)),
        share: Math.round((shares[i] / totalShare) * 10000) / 100,
      }));
    }

    function generateRegionBreakdown(totalVolume: number) {
      const shares = regions.map((_, i) => Math.max(2, 30 - i * 4 + Math.random() * 5));
      const totalShare = shares.reduce((a, b) => a + b, 0);
      return regions.map((region, i) => ({
        region,
        volume: Math.round(totalVolume * (shares[i] / totalShare)),
        share: Math.round((shares[i] / totalShare) * 10000) / 100,
      }));
    }

    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const docs = sampleTopics.map((t) => ({
      tenantId: workspaceId,
      canonicalTopic: t.topic,
      exemplarPrompts: t.exemplars,
      estimatedVolume: t.volume,
      volumeCILow: Math.round(t.volume * 0.85),
      volumeCIHigh: Math.round(t.volume * 1.15),
      confidence: confidences[Math.floor(Math.random() * 2)] as string, // mostly high/medium
      engineBreakdown: generateEngineBreakdown(t.volume),
      regionBreakdown: generateRegionBreakdown(t.volume),
      intent: t.intent,
      sentiment: t.sentiment,
      provenance: Math.random() > 0.3 ? "observed" : "synthetic",
      observedFraction: 0.6 + Math.random() * 0.35,
      syntheticFraction: Math.random() * 0.4,
      tags: [t.topic.split(" ")[0], t.topic.split(" ").slice(-1)[0]],
      language: "en",
      trendData: generateTrendData(t.volume, t.direction),
      weekOverWeekChange: t.wow,
      isTrending: t.trending,
      trendDirection: t.direction,
      periodStart: weekAgo,
      periodEnd: now,
      granularity: "weekly",
      createdBy: session.user.id,
    }));

    const created = await PromptVolume.insertMany(docs);

    return NextResponse.json(
      {
        message: `Successfully seeded ${created.length} prompt volume topics`,
        count: created.length,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error seeding prompt volumes:", error);
    return NextResponse.json(
      { error: "Failed to seed prompt volumes" },
      { status: 500 }
    );
  }
}
