/**
 * Transactional mail. Sends through Resend's HTTP API when RESEND_API_KEY and SEAM_MAIL_FROM are set; otherwise the
 * message is logged (with its link) so local development and unconfigured deployments still show the flow.
 */
import { logger } from "@/core/log";

const log = logger("mail");

export interface Mail { to: string; subject: string; text: string; html?: string }

export function mailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.SEAM_MAIL_FROM);
}

export async function sendMail(mail: Mail): Promise<{ sent: boolean; id?: string }> {
  if (!mailConfigured()) {
    log.warn("mail not configured; message logged instead", { to: mail.to, subject: mail.subject, text: mail.text });
    return { sent: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.SEAM_MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html ?? `<pre style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;white-space:pre-wrap">${escapeHtml(mail.text)}</pre>` }),
  });
  if (!res.ok) { log.error("mail send failed", { status: res.status, body: (await res.text()).slice(0, 200) }); return { sent: false }; }
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return { sent: true, id: body.id };
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
