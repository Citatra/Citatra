import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/mongodb";
import User from "@/models/User";
import Workspace from "@/models/Workspace";
import Membership from "@/models/Membership";

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      provider: "credentials",
    });

    // Create a default workspace for the user
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-workspace`;
    const workspace = await Workspace.create({
      name: `${name}'s Workspace`,
      slug: `${slug}-${Date.now()}`,
      ownerId: user._id,
    });

    // Create owner membership
    await Membership.create({
      userId: user._id,
      workspaceId: workspace._id,
      role: "owner",
      joinedAt: new Date(),
    });

    return NextResponse.json(
      {
        message: "Account created successfully",
        user: { id: user._id, name: user.name, email: user.email },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "An error occurred during signup" },
      { status: 500 }
    );
  }
}
