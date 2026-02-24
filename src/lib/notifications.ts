/**
 * Notification service — creates in-app notifications and
 * optionally sends emails / Slack messages.
 *
 * Email: Uses a simple fetch to SendGrid API (if SENDGRID_API_KEY is set).
 * Slack: Uses incoming webhook URL stored in NotificationPreference.
 */
import { connectToDatabase } from "@/lib/mongodb";
import Notification from "@/models/Notification";
import NotificationPreference from "@/models/NotificationPreference";
import Membership from "@/models/Membership";
import User from "@/models/User";
import { triggerEvent } from "@/lib/pusher-server";

interface CreateNotificationOpts {
  tenantId: string;
  type: "brand_mentioned" | "brand_dropped" | "new_overview" | "weekly_digest" | "system";
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  /** If set, only notify this user; otherwise notify all workspace members */
  userId?: string;
}

/**
 * Create an in-app notification and optionally send email/Slack alerts
 * based on each member's preferences.
 */
export async function createNotification(opts: CreateNotificationOpts) {
  await connectToDatabase();

  // 1. Save in-app notification
  const notification = await Notification.create({
    tenantId: opts.tenantId,
    userId: opts.userId || undefined,
    type: opts.type,
    title: opts.title,
    message: opts.message,
    metadata: opts.metadata || {},
    read: false,
    channel: "in_app",
  });

  // 2. Trigger real-time push
  await triggerEvent(opts.tenantId, "notification:new", {
    id: notification._id.toString(),
    type: opts.type,
    title: opts.title,
    message: opts.message,
    createdAt: notification.createdAt,
  });

  // 3. Send email / Slack based on preferences
  const targetUserIds = opts.userId
    ? [opts.userId]
    : (
        await Membership.find({ workspaceId: opts.tenantId }).lean()
      ).map((m) => m.userId.toString());

  for (const uid of targetUserIds) {
    const prefs = await NotificationPreference.findOne({
      userId: uid,
      tenantId: opts.tenantId,
    }).lean();

    if (!prefs) continue; // No prefs saved — use defaults (in-app only)

    // Email
    const shouldEmail =
      (opts.type === "brand_mentioned" && prefs.emailOnMention) ||
      (opts.type === "brand_dropped" && prefs.emailOnDrop) ||
      opts.type === "weekly_digest" && prefs.emailDigest;

    if (shouldEmail) {
      const user = await User.findById(uid).lean();
      if (user?.email) {
        await sendEmail(user.email, opts.title, opts.message);
      }
    }

    // Slack
    const shouldSlack =
      prefs.slackWebhookUrl &&
      ((opts.type === "brand_mentioned" && prefs.slackOnMention) ||
        (opts.type === "brand_dropped" && prefs.slackOnDrop));

    if (shouldSlack && prefs.slackWebhookUrl) {
      await sendSlack(prefs.slackWebhookUrl, opts.title, opts.message);
    }
  }

  return notification;
}

/**
 * Send email via SendGrid API (if configured).
 */
async function sendEmail(to: string, subject: string, body: string) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || "noreply@citatra.app";

  if (!apiKey) {
    console.log(`[Email skipped] No SENDGRID_API_KEY. Would send to ${to}: "${subject}"`);
    return;
  }

  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromEmail, name: "Citatra" },
        subject,
        content: [
          { type: "text/plain", value: body },
          {
            type: "text/html",
            value: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1a1a1a;">${subject}</h2>
              <p style="color: #4a4a4a; line-height: 1.6;">${body}</p>
              <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
              <p style="color: #999; font-size: 12px;">Sent by Citatra AI Visibility Monitor</p>
            </div>`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error("SendGrid error:", res.status, await res.text());
    }
  } catch (error) {
    console.error("Email send error:", error);
  }
}

/**
 * Send Slack notification via incoming webhook.
 */
async function sendSlack(webhookUrl: string, title: string, message: string) {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: `🔔 ${title}` },
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: message },
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error("Slack webhook error:", res.status);
    }
  } catch (error) {
    console.error("Slack send error:", error);
  }
}

/**
 * Check if a brand was previously mentioned for a query and now isn't (dropped),
 * or if it's newly appeared (mentioned). Used to trigger alerts.
 */
export function detectBrandChange(
  previouslyMentioned: boolean,
  currentlyMentioned: boolean
): "mentioned" | "dropped" | "unchanged" {
  if (!previouslyMentioned && currentlyMentioned) return "mentioned";
  if (previouslyMentioned && !currentlyMentioned) return "dropped";
  return "unchanged";
}
