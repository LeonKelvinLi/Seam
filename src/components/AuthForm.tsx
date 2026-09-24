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
  const next = safeNext(params.get("next") ?? (mode === "login" ? "/account" : "/create"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(GOOGLE_ERRORS[params.get("error") ?? ""] ?? null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api(`/api/auth/${mode}`, { method: "POST", json: { email, password } });
      window.dispatchEvent(new Event("clipmelt:account-updated"));
      router.push(next); router.refresh();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="auth-shell">
      <aside className="auth-story" aria-label="Your Clipmelt workspace">
        <h2 className="display">Your next cut<br />starts here.</h2>
        <p>Pick up your footage, find your transitions, and keep track of your credits.</p>
        <div className="auth-filmstrip">
          <figure><img src="/examples/coffee-ocean/frame_a.jpg" alt="Coffee swirling in a cup" width={640} height={360} /><figcaption>Your first shot</figcaption></figure>
          <span className="auth-bridge" aria-label="Connected by an AI transition">↗</span>
          <figure><img src="/examples/coffee-ocean/frame_b.jpg" alt="Ocean waves seen from above" width={640} height={360} /><figcaption>Your next shot</figcaption></figure>
        </div>
        <Link href="/library" className="auth-example-link">See what Clipmelt makes <span aria-hidden="true">↗</span></Link>
      </aside>
      <section className="auth-panel" aria-labelledby="auth-title">
      <h1 id="auth-title" className="display">{mode === "login" ? "Log in to Clipmelt." : "Create your account."}</h1>
      <p className="auth-intro">{mode === "login" ? "Welcome back. Use the same account you used for your clips and credits." : "Your footage and credits, together in one place."}</p>
      {google && (
        <>
          <GoogleButton next={next} enabled label="Continue with Google" className="auth-google flex w-full" />
          <div className="auth-divider">or use email</div>
        </>
      )}
      <form onSubmit={submit} className="auth-form" aria-busy={busy}>
        <label htmlFor="auth-email">Email address</label>
        <input id="auth-email" type="email" required placeholder="you@example.com" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="auth-password-label"><label htmlFor="auth-password">Password</label>{mode === "login" && <Link href="/forgot">Forgot password?</Link>}</div>
        <input id="auth-password" type="password" required minLength={mode === "signup" ? 8 : undefined} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby={error ? "auth-error" : undefined} />
        {error && <div id="auth-error" className="auth-error" role="alert">{error}</div>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? (mode === "login" ? "Logging in…" : "Creating account…") : mode === "login" ? "Log in" : "Create account"}</button>
      </form>
      <p className="auth-switch">
        {mode === "login" ? <>New to Clipmelt? <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></> : <>Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`}>Log in</Link></>}
      </p>
      <Link href="/create" className="auth-guest">Keep exploring the studio <span aria-hidden="true">↗</span></Link>
      </section>
    </div>
  );
}
