import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import PageAnalysis, { AnalysisType } from "@/models/PageAnalysis";

export const runtime = "nodejs";

/**
 * GET /api/workspaces/[workspaceId]/page-analyses?analysisType=html-audit
 * Returns saved page analysis results for the given workspace and analysis type.
 */
export async function GET(
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

    const { searchParams } = new URL(req.url);
    const analysisType = searchParams.get("analysisType") as AnalysisType | null;

    if (!analysisType) {
      return NextResponse.json({ error: "analysisType is required" }, { status: 400 });
    }

    const results = await PageAnalysis.find({ workspaceId, analysisType })
      .sort({ analyzedAt: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({ results });
  } catch (error) {
    console.error("page-analyses GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/workspaces/[workspaceId]/page-analyses?analysisType=html-audit
 * Clears all saved analyses for the given type.
 */
export async function DELETE(
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

    const { searchParams } = new URL(req.url);
    const analysisType = searchParams.get("analysisType") as AnalysisType | null;

    if (!analysisType) {
      return NextResponse.json({ error: "analysisType is required" }, { status: 400 });
    }

    await PageAnalysis.deleteMany({ workspaceId, analysisType });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("page-analyses DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
