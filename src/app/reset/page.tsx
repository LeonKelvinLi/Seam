"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
function ResetForm() {
  const params = useSearchParams(); const router = useRouter(); const token = params.get("token") ?? "";
  const [password, setPassword] = useState(""); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api("/api/auth/reset", { method: "POST", json: { token, password } }); router.push("/account?reset=1"); router.refresh(); }
    catch (err) { setError((err as Error).message); setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="mt-6 grid gap-3">
      <input className="input" type="password" required minLength={8} autoComplete="new-password" placeholder="New password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="btn btn-primary" disabled={busy || !token}>{busy ? "Saving…" : "Set new password"}</button>
      {!token && <p className="text-sm text-red-300">This link is missing its token. Request a new reset email.</p>}
      {error && <p className="text-sm text-red-300">{error} <Link className="underline" href="/forgot">Request a new link</Link></p>}
    </form>
  );
}
export default function ResetPage() {
  return (
    <div className="mx-auto max-w-sm px-5 pb-20 pt-16">
      <h1 className="display text-3xl">Choose a new password.</h1>
      <p className="mt-2 muted text-sm">This signs you in and signs out every other device.</p>
      <Suspense fallback={null}><ResetForm /></Suspense>
    </div>
  );
}
