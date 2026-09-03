/**
 * Resend email sender + templates — TASK-069 (PRD US-004/FR-013).
 *
 * Contract verified from resend.com/docs (send-email API reference,
 * 2026-09-01): POST https://api.resend.com/emails, Authorization Bearer
 * <key>, body {from, to, subject, html} → {id}. Plain fetch — no SDK.
 * Optional Idempotency-Key header (unique per request, 24h TTL) used by the
 * cron path so Paddle-style retries can't double-send.
 *
 * SANDBOX RESTRICTION: the onboarding@resend.dev sender only delivers to
 * the Resend account-owner's address. Sending to arbitrary users requires
 * a verified sending domain (postship.app DNS) — launch item TASK-081/082.
 *
 * Copy voice: friendly-casual, NO em dashes (decision #11), never robotic.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export const DEFAULT_EMAIL_FROM = "Postship <onboarding@resend.dev>";
export const DEFAULT_APP_URL =
  "https://postship-webapp.rahulkolli0905.workers.dev";

export type SendEmailArgs = {
  apiKey: string;
  to: string;
  subject: string;
  html: string;
  /** Defaults to the Postship sandbox sender; env override per caller. */
  from?: string;
  /** Optional Idempotency-Key header (24h TTL) — use for retried sends. */
  idempotencyKey?: string;
};

export async function sendEmail(
  args: SendEmailArgs,
): Promise<{ ok: boolean; id: string | null }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.apiKey}`,
    "Content-Type": "application/json",
  };
  if (args.idempotencyKey) {
    headers["Idempotency-Key"] = args.idempotencyKey;
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      from: args.from ?? DEFAULT_EMAIL_FROM,
      to: [args.to],
      subject: args.subject,
      html: args.html,
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    console.error(
      "[email] send rejected:",
      res.status,
      bodyText.slice(0, 300),
    );
    return { ok: false, id: null };
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: data?.id ?? null };
}

function emailShell(title: string, bodyHtml: string, ctaLabel: string, ctaUrl: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#faf7f0;font-family:Helvetica,Arial,sans-serif;color:#1c1a15;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e6e0d4;border-radius:8px;padding:32px;">
    <p style="margin:0 0 16px;font-size:13px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#8a8577;">Postship</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1c1a15;">${title}</h1>
    <div style="font-size:15px;line-height:1.6;color:#3d3a32;">${bodyHtml}</div>
    <p style="margin:24px 0 0;">
      <a href="${ctaUrl}" style="display:inline-block;background:#1c1a15;color:#faf7f0;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:6px;">${ctaLabel}</a>
    </p>
    <p style="margin:24px 0 0;font-size:12px;color:#8a8577;">You're receiving this because you signed up for Postship.</p>
  </div>
</body></html>`;
}

export function welcomeEmail(appUrl: string): {
  subject: string;
  html: string;
} {
  return {
    subject: "You're in. Postship writes every caption",
    html: emailShell(
      "You're in.",
      `<p>Welcome aboard. Here's the whole product in one sentence: upload 1 or 2 videos, write one master description, and Postship drafts a native caption for every platform you pick.</p>
       <p>Your 7-day trial includes 5 posts. Every draft is editable, so nothing ships unless it sounds like you.</p>`,
      "Open Postship",
      appUrl,
    ),
  };
}

export function trialExpiryEmail(appUrl: string): {
  subject: string;
  html: string;
} {
  return {
    subject: "Your Postship trial ends tomorrow",
    html: emailShell(
      "Your trial ends tomorrow.",
      `<p>Quick heads up: your 7-day Postship trial ends tomorrow. After that you lose the ability to publish, but nothing disappears. Your drafts and captions stay right where you left them.</p>
       <p>Upgrade to Creator or Pro to keep publishing without interruptions.</p>`,
      "Upgrade now",
      `${appUrl}/settings/billing`,
    ),
  };
}
