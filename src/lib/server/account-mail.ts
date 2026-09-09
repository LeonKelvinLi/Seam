import { AuthTokens, Users } from "@/db/repo";
import type { User } from "@/core/types";
import { publicOrigin } from "@/lib/server/site";
import { sendMail } from "@/lib/server/mail";

const HOUR = 60 * 60_000;

export async function sendVerification(user: User): Promise<boolean> {
  if (!user.email) return false;
  const token = AuthTokens.issue(user.id, "verify", 7 * 24 * HOUR);
  const link = `${publicOrigin()}/verify?token=${token}`;
  const r = await sendMail({ to: user.email, subject: "Confirm your SeamCut email", text: `Welcome to SeamCut.\n\nConfirm this address to secure your account and enable password recovery:\n${link}\n\nThe link is valid for 7 days. If you did not create an account, ignore this message.` });
  return r.sent;
}

export async function sendPasswordReset(email: string): Promise<boolean> {
  const user = Users.byEmail(email);
  if (!user?.email) return false;
  const token = AuthTokens.issue(user.id, "reset", HOUR);
  const link = `${publicOrigin()}/reset?token=${token}`;
  const r = await sendMail({ to: user.email, subject: "Reset your SeamCut password", text: `Someone asked to reset the password for this SeamCut account.\n\nSet a new password here (valid for one hour):\n${link}\n\nIf that wasn't you, ignore this message; your password stays the same.` });
  return r.sent;
}
