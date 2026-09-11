/**
 * Transactional mail. Sends through Resend's HTTP API when RESEND_API_KEY and SEAM_MAIL_FROM are set; otherwise the
 * message is logged with its link only in local development. Production logs never include mail content.
 */
import { logger } from "@/core/log";

const log = logger("mail");

export interface Mail { to: string; subject: string; text: string; html?: string }

export function mailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY?.trim() && process.env.SEAM_MAIL_FROM?.trim());
}

const domainOf = (address: string) => address.match(/@([^>\s]+)/)?.[1]?.toLowerCase();

/**
 * Reply-To is set only when the support address sits on the sending domain. A business From with a
 * free-mail Reply-To (gmail.com, outlook.com…) is a forgery pattern to spam filters — SpamAssassin's
 * FREEMAIL_FORGED_REPLYTO alone costs about 2.5 points and lands account mail in Spam. Support stays
 * reachable through the address on the legal pages either way.
 */
export function replyToAddress(): string | undefined {
  const support = process.env.SEAM_SUPPORT_EMAIL?.trim();
  const from = process.env.SEAM_MAIL_FROM?.trim();
  if (!support || !from) return undefined;
  const fromDomain = domainOf(from);
  return fromDomain && domainOf(support) === fromDomain ? support : undefined;
}

export async function sendMail(mail: Mail): Promise<{ sent: boolean; id?: string }> {
  if (!mailConfigured()) {
    if (process.env.NODE_ENV === "development") {
      log.warn("mail not configured; development message", { to: mail.to, subject: mail.subject, text: mail.text });
    } else {
      log.warn("mail not configured; message not sent");
    }
    return { sent: false };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY?.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.SEAM_MAIL_FROM?.trim(), reply_to: replyToAddress(), to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html ?? `<pre style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;white-space:pre-wrap">${escapeHtml(mail.text)}</pre>` }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) { log.error("mail send failed", { status: res.status }); return { sent: false }; }
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { sent: true, id: body.id };
  } catch {
    // Provider errors must not expose message contents or change password recovery responses by account existence.
    log.error("mail provider request failed");
    return { sent: false };
  }
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
