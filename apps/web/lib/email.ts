"use server";

import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.EMAIL_FROM || "noreply@vpnvpn.com";
const WEB_BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

if (!resend) {
  console.warn(
    "[email] RESEND_API_KEY not set. Email notifications will be skipped.",
  );
}

export type EmailTemplate =
  | "welcome"
  | "magic_link"
  | "subscription_active"
  | "subscription_cancelled"
  | "device_added"
  | "device_revoked";

interface EmailContext {
  to: string;
  template: EmailTemplate;
  data: Record<string, any>;
}

function buildEmailContent(template: EmailTemplate, data: Record<string, any>) {
  switch (template) {
    case "welcome":
      return {
        subject: "Welcome to vpnVPN",
        html: `
          <h1>Welcome to vpnVPN!</h1>
          <p>Hi ${data.name || "there"},</p>
          <p>Thank you for signing up! Your account has been created successfully.</p>
          <p>To get started, please subscribe to one of our plans and add your first device.</p>
          <p><a href="${data.dashboardUrl || `${WEB_BASE_URL}/dashboard`}">Go to Dashboard</a></p>
          <p>Best regards,<br>The vpnVPN Team</p>
        `,
        text: `Welcome to vpnVPN!\n\nHi ${data.name || "there"},\n\nThank you for signing up! Your account has been created successfully.\n\nTo get started, please subscribe to one of our plans and add your first device.\n\nGo to Dashboard: ${data.dashboardUrl || `${WEB_BASE_URL}/dashboard`}\n\nBest regards,\nThe vpnVPN Team`,
      };

    case "magic_link": {
      const url = data.url as string;
      const desktopUrl = (data.desktopUrl as string | undefined) || "";
      const desktopCode = (data.desktopCode as string | undefined) || "";
      const host = (() => {
        try {
          return new URL(url).host;
        } catch {
          try {
            return new URL(WEB_BASE_URL).host;
          } catch {
            return "vpnvpn.dev";
          }
        }
      })();

      // Desktop flows: send a code-only email, no clickable magic link.
      if (desktopCode) {
        return {
          subject: "Your vpnVPN desktop sign-in code",
          html: `
            <h1>Your vpnVPN desktop sign-in code</h1>
            <p>Hi ${data.name || "there"},</p>
            <p>Use the code below to sign in to the vpnVPN desktop app:</p>
            <p style="margin:24px 0;font-size:24px;font-weight:700;letter-spacing:0.25em;text-align:center;">
              ${desktopCode}
            </p>
            <p>This code expires in 15 minutes and can only be used once.</p>
            <p>If you did not request this, you can safely ignore this email.</p>
            <p>Best regards,<br>The vpnVPN Team</p>
          `,
          text: `Your vpnVPN desktop sign-in code\n\nHi ${
            data.name || "there"
          },\n\nUse the code below to sign in to the vpnVPN desktop app:\n\n${desktopCode}\n\nThis code expires in 15 minutes and can only be used once.\nIf you did not request this, you can safely ignore this email.\n\nBest regards,\nThe vpnVPN Team`,
        };
      }

      // Web flows: keep standard magic-link email.
      return {
        subject: "Sign in to vpnVPN",
        html: `
          <h1>Sign in to vpnVPN</h1>
          <p>Hi ${data.name || "there"},</p>
          <p>Click the button below to securely sign in to your vpnVPN account on <strong>${host}</strong>.</p>
          <p style="margin: 24px 0;">
            <a href="${url}" style="background-color:#111827;color:#ffffff;padding:10px 18px;border-radius:9999px;text-decoration:none;font-weight:600;display:inline-block;">
              Sign in
            </a>
          </p>
          <p>If the button does not work, copy and paste this URL into your browser:</p>
          <p><a href="${url}">${url}</a></p>
          <p>This magic link will expire shortly. If you did not request this, you can safely ignore this email.</p>
          <p>Best regards,<br>The vpnVPN Team</p>
        `,
        text: `Sign in to vpnVPN\n\nHi ${data.name || "there"},\n\nOpen the link below to securely sign in to your vpnVPN account on ${host}.\n\n${url}\n\nThis magic link will expire shortly. If you did not request this, you can safely ignore this email.\n\nBest regards,\nThe vpnVPN Team`,
      };
    }

    case "subscription_active":
      return {
        subject: "Your vpnVPN Subscription is Active",
        html: `
          <h1>Subscription Activated</h1>
          <p>Hi ${data.name || "there"},</p>
          <p>Your <strong>${data.plan || "Pro"}</strong> subscription is now active!</p>
          <p>You can now add devices and connect to our VPN servers.</p>
          <ul>
            <li>Device limit: ${data.deviceLimit || "5"}</li>
            <li>Next billing date: ${data.nextBillingDate || "N/A"}</li>
          </ul>
          <p><a href="${data.dashboardUrl || `${WEB_BASE_URL}/dashboard`}">Manage Devices</a></p>
          <p>Best regards,<br>The vpnVPN Team</p>
        `,
        text: `Subscription Activated\n\nHi ${data.name || "there"},\n\nYour ${data.plan || "Pro"} subscription is now active!\n\nYou can now add devices and connect to our VPN servers.\n\nDevice limit: ${data.deviceLimit || "5"}\nNext billing date: ${data.nextBillingDate || "N/A"}\n\nManage Devices: ${data.dashboardUrl || `${WEB_BASE_URL}/dashboard`}\n\nBest regards,\nThe vpnVPN Team`,
      };

    case "subscription_cancelled":
      return {
        subject: "Your vpnVPN Subscription Has Been Cancelled",
        html: `
          <h1>Subscription Cancelled</h1>
          <p>Hi ${data.name || "there"},</p>
          <p>Your vpnVPN subscription has been cancelled.</p>
          <p>Your VPN access has been disabled. All your devices have been disconnected.</p>
          <p>If you'd like to resubscribe, you can do so anytime from your account page.</p>
          <p><a href="${data.pricingUrl || `${WEB_BASE_URL}/pricing`}">View Plans</a></p>
          <p>Best regards,<br>The vpnVPN Team</p>
        `,
        text: `Subscription Cancelled\n\nHi ${data.name || "there"},\n\nYour vpnVPN subscription has been cancelled.\n\nYour VPN access has been disabled. All your devices have been disconnected.\n\nIf you'd like to resubscribe, you can do so anytime from your account page.\n\nView Plans: ${data.pricingUrl || `${WEB_BASE_URL}/pricing`}\n\nBest regards,\nThe vpnVPN Team`,
      };

    case "device_added":
      return {
        subject: "New Device Added to Your vpnVPN Account",
        html: `
          <h1>New Device Added</h1>
          <p>Hi ${data.name || "there"},</p>
          <p>A new device <strong>${data.deviceName}</strong> has been added to your vpnVPN account.</p>
          <p>If this wasn't you, please review your account security and revoke any unknown devices.</p>
          <p><a href="${data.dashboardUrl || `${WEB_BASE_URL}/dashboard`}">View Devices</a></p>
          <p>Best regards,<br>The vpnVPN Team</p>
        `,
        text: `New Device Added\n\nHi ${data.name || "there"},\n\nA new device ${data.deviceName} has been added to your vpnVPN account.\n\nIf this wasn't you, please review your account security and revoke any unknown devices.\n\nView Devices: ${data.dashboardUrl || `${WEB_BASE_URL}/dashboard`}\n\nBest regards,\nThe vpnVPN Team`,
      };

    case "device_revoked":
      return {
        subject: "Device Removed from Your vpnVPN Account",
        html: `
          <h1>Device Removed</h1>
          <p>Hi ${data.name || "there"},</p>
          <p>The device <strong>${data.deviceName}</strong> has been removed from your vpnVPN account.</p>
          <p>If this wasn't you, please review your account security immediately.</p>
          <p><a href="${data.dashboardUrl || `${WEB_BASE_URL}/dashboard`}">View Devices</a></p>
          <p>Best regards,<br>The vpnVPN Team</p>
        `,
        text: `Device Removed\n\nHi ${data.name || "there"},\n\nThe device ${data.deviceName} has been removed from your vpnVPN account.\n\nIf this wasn't you, please review your account security immediately.\n\nView Devices: ${data.dashboardUrl || `${WEB_BASE_URL}/dashboard`}\n\nBest regards,\nThe vpnVPN Team`,
      };

    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}

export async function sendEmail(context: EmailContext): Promise<void> {
  if (!resend) {
    console.warn("[email] Skipping email send (no API key)", {
      template: context.template,
      to: context.to,
    });

    // For magic links we want the caller (NextAuth) to know this is a hard failure
    // so the frontend can surface an error instead of pretending success.
    if (context.template === "magic_link") {
      throw new Error(
        "RESEND_API_KEY is not configured; cannot send magic link",
      );
    }
    return;
  }

  try {
    const content = buildEmailContent(context.template, context.data);

    await resend.emails.send({
      from: FROM_EMAIL,
      to: context.to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });

    console.log("[email] Sent successfully", {
      template: context.template,
      to: context.to,
    });
  } catch (error) {
    console.error("[email] Failed to send", {
      template: context.template,
      to: context.to,
      error,
    });
    // Propagate failures for magic link emails so auth can fail visibly;
    // keep other templates as soft-fail to avoid breaking non-critical flows.
    if (context.template === "magic_link") {
      throw error instanceof Error
        ? error
        : new Error("Failed to send magic link email");
    }
  }
}
