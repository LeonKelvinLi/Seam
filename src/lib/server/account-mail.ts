import { AuthTokens, Users } from "@/db/repo";
import type { User } from "@/core/types";
import { SITE_NAME, legalContact, publicOrigin } from "@/lib/server/site";
import { sendMail } from "@/lib/server/mail";

const HOUR = 60 * 60_000;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * One layout for every account email. Filters read image-only mail, hidden links and an HTML part that
 * says something different from the text part as spam signals; this has none of those. Same words in both
 * parts, one visible link shown in full, and a footer saying who sent it and why.
 */
function accountMailHtml(args: { heading: string; intro: string; ctaLabel: string; link: string; note: string; why: string }): string {
  const { companyName, supportEmail } = legalContact();
  const host = publicOrigin().replace(/^https?:\/\//, "");
  return [
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(args.heading)}</title></head>`,
    `<body style="margin:0;padding:24px;background:#f4f4f5;font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#18181b">`,
    `<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:28px">`,
    `<div style="font-size:18px;font-weight:600;letter-spacing:-0.01em">${SITE_NAME}</div>`,
    `<h1 style="margin:20px 0 8px;font-size:20px;line-height:1.3;font-weight:600">${esc(args.heading)}</h1>`,
    `<p style="margin:0 0 20px;color:#3f3f46">${esc(args.intro)}</p>`,
    `<p style="margin:0 0 20px"><a href="${esc(args.link)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${esc(args.ctaLabel)}</a></p>`,
    `<p style="margin:0 0 6px;color:#52525b;font-size:14px">Or paste this address into your browser:</p>`,
    `<p style="margin:0 0 20px;font-size:13px;word-break:break-all"><a href="${esc(args.link)}" style="color:#3f3f46">${esc(args.link)}</a></p>`,
    `<p style="margin:0 0 24px;color:#52525b;font-size:14px">${esc(args.note)}</p>`,
    `<hr style="border:0;border-top:1px solid #e4e4e7;margin:0 0 16px">`,
    `<p style="margin:0;color:#71717a;font-size:12px">${esc(args.why)}${supportEmail ? ` Reply to this email, or write to ${esc(supportEmail)}, if you need help.` : " Reply to this email if you need help."}</p>`,
    `<p style="margin:8px 0 0;color:#a1a1aa;font-size:12px">${SITE_NAME} &middot; ${esc(companyName)} &middot; ${esc(host)}</p>`,
    `</div></body></html>`,
  ].join("");
}

export function verificationMail(link: string) {
  const host = publicOrigin().replace(/^https?:\/\//, "");
  return {
    subject: `Confirm your ${SITE_NAME} email`,
    text: `Welcome to ${SITE_NAME}.\n\nConfirm this address to secure your account and enable password recovery:\n${link}\n\nThe link works for 7 days. If you did not create an account, ignore this message.\n\nYou received this because this address was used to create a ${SITE_NAME} account at ${host}.`,
    html: accountMailHtml({
      heading: "Confirm your email",
      intro: `Confirm this address to secure your ${SITE_NAME} account and turn on password recovery.`,
      ctaLabel: "Confirm email",
      link,
      note: "The link works for 7 days. If you did not create an account, ignore this message and nothing will happen.",
      why: `You received this because this address was used to create a ${SITE_NAME} account at ${host}.`,
    }),
  };
}

export function passwordResetMail(link: string) {
  const host = publicOrigin().replace(/^https?:\/\//, "");
  return {
    subject: `Reset your ${SITE_NAME} password`,
    text: `Someone asked to reset the password for this ${SITE_NAME} account.\n\nSet a new password here (valid for one hour):\n${link}\n\nIf that wasn't you, ignore this message; your password stays the same.\n\nYou received this because a password reset was requested for this address at ${host}.`,
    html: accountMailHtml({
      heading: "Reset your password",
      intro: `Someone asked to reset the password for this ${SITE_NAME} account. Use the link below to set a new one.`,
      ctaLabel: "Set a new password",
      link,
      note: "The link works for one hour. If that wasn't you, ignore this message; your password stays the same.",
      why: `You received this because a password reset was requested for this address at ${host}.`,
    }),
  };
}

export async function sendVerification(user: User): Promise<boolean> {
  if (!user.email) return false;
  const token = AuthTokens.issue(user.id, "verify", 7 * 24 * HOUR);
  const r = await sendMail({ to: user.email, ...verificationMail(`${publicOrigin()}/verify?token=${token}`) });
  return r.sent;
}

export async function sendPasswordReset(email: string): Promise<boolean> {
  const user = Users.byEmail(email);
  if (!user?.email) return false;
  const token = AuthTokens.issue(user.id, "reset", HOUR);
  const r = await sendMail({ to: user.email, ...passwordResetMail(`${publicOrigin()}/reset?token=${token}`) });
  return r.sent;
}
