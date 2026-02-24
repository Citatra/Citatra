import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import Workspace from "@/models/Workspace";
import {
  testCmsConnection,
  pushSchemaToCms,
  type CmsPlatform,
} from "@/lib/cms";

export const runtime = "nodejs";

interface CmsConnection {
  platform: "wordpress" | "webflow" | "shopify";
  status: "connected" | "disconnected" | "error";
  siteUrl?: string;
  apiKey?: string;
  lastSync?: string;
  capabilities: string[];
}

/**
 * GET /api/workspaces/[workspaceId]/cms-connectors
 * Lists CMS connections for the workspace.
 *
 * POST /api/workspaces/[workspaceId]/cms-connectors
 * Connect, disconnect, or push schema to a CMS.
 */
export async function GET(
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
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const workspace = (await Workspace.findById(workspaceId).lean()) as unknown as Record<
      string,
      unknown
    >;

    const settings = (workspace?.settings as Record<string, unknown>) || {};
    const cmsConnections = (settings.cmsConnections as CmsConnection[]) || [];

    // Default available platforms
    const platforms: CmsConnection[] = [
      {
        platform: "wordpress",
        status: "disconnected",
        capabilities: [
          "Schema injection via REST API",
          "Content updates for meta and structured data",
          "Auto-publish schema markup",
        ],
        ...(cmsConnections.find((c) => c.platform === "wordpress") || {}),
      },
      {
        platform: "webflow",
        status: "disconnected",
        capabilities: [
          "Custom code injection in page headers",
          "Schema markup in embeds",
          "CMS collection updates",
        ],
        ...(cmsConnections.find((c) => c.platform === "webflow") || {}),
      },
      {
        platform: "shopify",
        status: "disconnected",
        capabilities: [
          "Product schema injection via Liquid",
          "Theme asset updates",
          "Script tag injection for JSON-LD",
        ],
        ...(cmsConnections.find((c) => c.platform === "shopify") || {}),
      },
    ];

    return NextResponse.json({ connections: platforms });
  } catch (error) {
    console.error("CMS connectors GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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
    const { action, platform, siteUrl, apiKey, schemaData } = body as {
      action: "connect" | "disconnect" | "push-schema" | "test";
      platform: "wordpress" | "webflow" | "shopify";
      siteUrl?: string;
      apiKey?: string;
      schemaData?: string;
    };

    if (!action || !platform) {
      return NextResponse.json(
        { error: "action and platform are required" },
        { status: 400 }
      );
    }

    if (action === "connect") {
      if (!siteUrl || !apiKey) {
        return NextResponse.json(
          { error: "siteUrl and apiKey are required" },
          { status: 400 }
        );
      }

      // Store connection in workspace settings
      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }

      const settings = (workspace.settings as Record<string, unknown>) || {};
      const connections = ((settings.cmsConnections as CmsConnection[]) || []).filter(
        (c) => c.platform !== platform
      );

      connections.push({
        platform,
        status: "connected",
        siteUrl,
        apiKey,
        lastSync: new Date().toISOString(),
        capabilities: [],
      });

      workspace.settings = { ...settings, cmsConnections: connections };
      await workspace.save();

      return NextResponse.json({
        success: true,
        message: `${platform} connected successfully`,
        connection: { platform, status: "connected", siteUrl },
      });
    }

    if (action === "disconnect") {
      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }

      const settings = (workspace.settings as Record<string, unknown>) || {};
      const connections = ((settings.cmsConnections as CmsConnection[]) || []).filter(
        (c) => c.platform !== platform
      );

      workspace.settings = { ...settings, cmsConnections: connections };
      await workspace.save();

      return NextResponse.json({
        success: true,
        message: `${platform} disconnected`,
      });
    }

    if (action === "push-schema") {
      if (!schemaData) {
        return NextResponse.json({ error: "schemaData is required" }, { status: 400 });
      }

      // Find the connection for this platform to get stored credentials
      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }

      const settings = (workspace.settings as Record<string, unknown>) || {};
      const connections = ((settings.cmsConnections as CmsConnection[]) || []);
      const conn = connections.find((c) => c.platform === platform);

      if (!conn || conn.status !== "connected") {
        return NextResponse.json(
          { error: `${platform} is not connected. Connect it first.` },
          { status: 400 }
        );
      }

      // Use the real CMS adapter to push schema
      const result = await pushSchemaToCms(
        platform as CmsPlatform,
        conn.siteUrl || "",
        conn.apiKey || "",
        schemaData
      );

      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            message: result.message,
            error: result.error,
            details: result.details,
          },
          { status: 502 }
        );
      }

      // Update lastSync timestamp
      const updatedConnections = connections.map((c) =>
        c.platform === platform
          ? { ...c, lastSync: new Date().toISOString() }
          : c
      );
      workspace.settings = { ...settings, cmsConnections: updatedConnections };
      await workspace.save();

      return NextResponse.json({
        success: true,
        message: result.message,
        details: result.details,
      });
    }

    if (action === "test") {
      // Find stored connection credentials
      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }

      const settings = (workspace.settings as Record<string, unknown>) || {};
      const connections = ((settings.cmsConnections as CmsConnection[]) || []);
      const conn = connections.find((c) => c.platform === platform);

      if (!conn || !conn.siteUrl || !conn.apiKey) {
        return NextResponse.json(
          { error: `No stored credentials for ${platform}. Connect it first.` },
          { status: 400 }
        );
      }

      // Use real CMS adapter to test connection
      const result = await testCmsConnection(
        platform as CmsPlatform,
        conn.siteUrl,
        conn.apiKey
      );

      // Update connection status based on test result
      const updatedConnections = connections.map((c) =>
        c.platform === platform
          ? { ...c, status: result.success ? "connected" : "error" }
          : c
      );
      workspace.settings = { ...settings, cmsConnections: updatedConnections };
      await workspace.save();

      return NextResponse.json({
        success: result.success,
        message: result.message,
        latency: result.latency + "ms",
        siteInfo: result.siteInfo,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("CMS connectors POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
