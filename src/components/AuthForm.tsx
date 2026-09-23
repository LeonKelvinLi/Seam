"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { safeNext } from "@/lib/safe-next";
import { GoogleButton } from "@/components/GoogleButton";

const GOOGLE_ERRORS: Record<string, string> = {
  google_unavailable: "Google sign-in isn't available right now. Use email instead.",
  google_denied: "Google sign-in was cancelled.",
  google_busy: "Too many attempts. Wait a minute and try again.",
  google_expired: "That sign-in took too long. Try again.",
  google_unverified: "Your Google email isn't verified yet.",
  google_conflict: "That email is already linked to a different Google account.",
  google_failed: "Google sign-in didn't work. Try again, or use email.",
};

export function AuthForm({ mode, google }: { mode: "login" | "signup"; google: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(GOOGLE_ERRORS[params.get("error") ?? ""] ?? null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api(`/api/auth/${mode}`, { method: "POST", json: { email, password } });
      router.push(next); router.refresh();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-sm px-5 pb-20 pt-16">
      <h1 className="display text-3xl">{mode === "login" ? "Welcome back." : "Create your account."}</h1>
      <p className="mt-2 muted text-sm">{mode === "login" ? "Your projects and credits are waiting." : "3 free runs. Your guest projects come with you."}</p>
      {google && (
        <>
          <GoogleButton next={next} enabled label={mode === "login" ? "Continue with Google" : "Sign up with Google"} className="mt-8 flex w-full" />
          <div className="mt-6 flex items-center gap-3 text-xs muted"><span className="h-px flex-1" style={{ background: "var(--line, rgba(255,255,255,0.12))" }} />or with email<span className="h-px flex-1" style={{ background: "var(--line, rgba(255,255,255,0.12))" }} /></div>
        </>
      )}
      <form onSubmit={submit} className={google ? "mt-6 space-y-3" : "mt-8 space-y-3"}>
        <input className="w-full rounded-xl px-4 py-3 outline-none hair" style={{ background: "var(--bg-2)" }} type="email" required placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full rounded-xl px-4 py-3 outline-none hair" style={{ background: "var(--bg-2)" }} type="password" required minLength={8} placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="text-sm" style={{ color: "var(--accent)" }}>{error}</div>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "…" : mode === "login" ? "Sign in" : "Create account"}</button>
      </form>
      <p className="mt-6 text-sm muted">
        {mode === "login" ? <><Link className="underline" href="/forgot">Forgot password?</Link> · New here? <Link className="underline" href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></> : <>Already have one? <Link className="underline" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></>}
      </p>
    </div>
  );
}

