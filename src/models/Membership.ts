import mongoose, { Schema, Document, Model } from "mongoose";

export type MemberRole = "owner" | "admin" | "editor" | "viewer";

export interface IMembership extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  role: MemberRole;
  invitedBy?: mongoose.Types.ObjectId;
  invitedAt?: Date;
  joinedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipSchema = new Schema<IMembership>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    role: {
      type: String,
      enum: ["owner", "admin", "editor", "viewer"],
      default: "viewer",
    },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User" },
    invitedAt: { type: Date },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

MembershipSchema.index({ userId: 1, workspaceId: 1 }, { unique: true });
MembershipSchema.index({ workspaceId: 1 });

const Membership: Model<IMembership> =
  mongoose.models.Membership ||
  mongoose.model<IMembership>("Membership", MembershipSchema);

export default Membership;
