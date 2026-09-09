"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
export default function ForgotPage() {
  const [email, setEmail] = useState(""); const [done, setDone] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { const r = await api<{ delivery: "configured" | "unavailable" }>("/api/auth/forgot", { method: "POST", json: { email } }); setDone(r.delivery === "configured" ? "Request received. If that address has an account, check your inbox for a reset link, valid for one hour. If it does not arrive, try again or contact support." : "Password reset email is currently unavailable. Contact support for help accessing your account."); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-sm px-5 pb-20 pt-16">
      <h1 className="display text-3xl">Reset your password.</h1>
      <p className="mt-2 muted text-sm">Enter the email on your account and we will send a one-hour link.</p>
      {done ? <p className="mt-6 text-sm">{done}</p> : (
        <form onSubmit={submit} className="mt-6 grid gap-3">
          <input className="input" type="email" required autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn btn-primary" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
          {error && <p className="text-sm text-red-300">{error}</p>}
        </form>
      )}
      <p className="mt-6 text-sm muted"><Link className="underline" href="/login">Back to sign in</Link></p>
    </div>
  );
}
