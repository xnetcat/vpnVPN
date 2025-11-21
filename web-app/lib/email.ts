"use server";

import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.EMAIL_FROM || "noreply@vpnvpn.com";

if (!resend) {
  console.warn(
    "[email] RESEND_API_KEY not set. Email notifications will be skipped."
  );
}

export type EmailTemplate =
  | "welcome"
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
          <p><a href="${data.dashboardUrl || "https://app.vpnvpn.com/dashboard"}">Go to Dashboard</a></p>
          <p>Best regards,<br>The vpnVPN Team</p>
        `,
        text: `Welcome to vpnVPN!\n\nHi ${data.name || "there"},\n\nThank you for signing up! Your account has been created successfully.\n\nTo get started, please subscribe to one of our plans and add your first device.\n\nGo to Dashboard: ${data.dashboardUrl || "https://app.vpnvpn.com/dashboard"}\n\nBest regards,\nThe vpnVPN Team`,
      };

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
          <p><a href="${data.dashboardUrl || "https://app.vpnvpn.com/dashboard"}">Manage Devices</a></p>
          <p>Best regards,<br>The vpnVPN Team</p>
        `,
        text: `Subscription Activated\n\nHi ${data.name || "there"},\n\nYour ${data.plan || "Pro"} subscription is now active!\n\nYou can now add devices and connect to our VPN servers.\n\nDevice limit: ${data.deviceLimit || "5"}\nNext billing date: ${data.nextBillingDate || "N/A"}\n\nManage Devices: ${data.dashboardUrl || "https://app.vpnvpn.com/dashboard"}\n\nBest regards,\nThe vpnVPN Team`,
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
          <p><a href="${data.pricingUrl || "https://app.vpnvpn.com/pricing"}">View Plans</a></p>
          <p>Best regards,<br>The vpnVPN Team</p>
        `,
        text: `Subscription Cancelled\n\nHi ${data.name || "there"},\n\nYour vpnVPN subscription has been cancelled.\n\nYour VPN access has been disabled. All your devices have been disconnected.\n\nIf you'd like to resubscribe, you can do so anytime from your account page.\n\nView Plans: ${data.pricingUrl || "https://app.vpnvpn.com/pricing"}\n\nBest regards,\nThe vpnVPN Team`,
      };

    case "device_added":
      return {
        subject: "New Device Added to Your vpnVPN Account",
        html: `
          <h1>New Device Added</h1>
          <p>Hi ${data.name || "there"},</p>
          <p>A new device <strong>${data.deviceName}</strong> has been added to your vpnVPN account.</p>
          <p>If this wasn't you, please review your account security and revoke any unknown devices.</p>
          <p><a href="${data.dashboardUrl || "https://app.vpnvpn.com/dashboard"}">View Devices</a></p>
          <p>Best regards,<br>The vpnVPN Team</p>
        `,
        text: `New Device Added\n\nHi ${data.name || "there"},\n\nA new device ${data.deviceName} has been added to your vpnVPN account.\n\nIf this wasn't you, please review your account security and revoke any unknown devices.\n\nView Devices: ${data.dashboardUrl || "https://app.vpnvpn.com/dashboard"}\n\nBest regards,\nThe vpnVPN Team`,
      };

    case "device_revoked":
      return {
        subject: "Device Removed from Your vpnVPN Account",
        html: `
          <h1>Device Removed</h1>
          <p>Hi ${data.name || "there"},</p>
          <p>The device <strong>${data.deviceName}</strong> has been removed from your vpnVPN account.</p>
          <p>If this wasn't you, please review your account security immediately.</p>
          <p><a href="${data.dashboardUrl || "https://app.vpnvpn.com/dashboard"}">View Devices</a></p>
          <p>Best regards,<br>The vpnVPN Team</p>
        `,
        text: `Device Removed\n\nHi ${data.name || "there"},\n\nThe device ${data.deviceName} has been removed from your vpnVPN account.\n\nIf this wasn't you, please review your account security immediately.\n\nView Devices: ${data.dashboardUrl || "https://app.vpnvpn.com/dashboard"}\n\nBest regards,\nThe vpnVPN Team`,
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
    // Don't throw - email failures shouldn't break the app
  }
}

