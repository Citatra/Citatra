import mongoose, { Schema, Document, Model } from "mongoose";

export interface IInvitation extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  workspaceId: mongoose.Types.ObjectId;
  role: "admin" | "editor" | "viewer";
  token: string;
  invitedBy: mongoose.Types.ObjectId;
  status: "pending" | "accepted" | "expired";
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    email: { type: String, required: true, lowercase: true },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    role: {
      type: String,
      enum: ["admin", "editor", "viewer"],
      default: "viewer",
    },
    token: { type: String, required: true, unique: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "expired"],
      default: "pending",
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  },
  { timestamps: true }
);

InvitationSchema.index({ token: 1 });
InvitationSchema.index({ email: 1, workspaceId: 1 });

const Invitation: Model<IInvitation> =
  mongoose.models.Invitation ||
  mongoose.model<IInvitation>("Invitation", InvitationSchema);

export default Invitation;
