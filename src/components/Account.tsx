"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Me {
  user: {
    id: string;
    email: string | null;
    credits: number;
    plan: string;
    createdAt: string;
  } | null;
  purchases: {
    id: string;
    pack: string;
    credits: number;
    amountCents: number;
    currency: string;
    createdAt: string;
  }[];
}

export function Account() {
  const router = useRouter();
  const params = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const load = useCallback(async () => {
    setError(null);
    try {
      const account = await api<Me>("/api/auth/me");
      if (!account.user) router.replace("/login?next=/account");
      else {
        setMe(account);
        window.dispatchEvent(new Event("clipmelt:account-updated"));
      }
    } catch {
      setError(
        "Your account couldn't load. Check your connection and try again.",
      );
    }
  }, [router]);
  useEffect(() => {
    void load();
  }, [load]);
  const logout = async () => {
    setLeaving(true);
    setError(null);
    try {
      await api("/api/auth/logout", { method: "POST", json: {} });
      window.dispatchEvent(new Event("clipmelt:account-updated"));
      router.push("/");
      router.refresh();
    } catch {
      setError("Sign out didn't complete. Please try again.");
      setLeaving(false);
    }
  };
  if (!me?.user)
    return (
      <div className="account-shell">
        <div className="surface-message" role={error ? "alert" : "status"}>
          {error || "Loading your workspace…"}
          {error && (
            <div>
              <button className="btn btn-ghost" onClick={load}>
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    );
  return (
    <div className="account-shell">
      <span className="page-kicker">A home for your next idea</span>
      <div className="account-heading">
        <div>
          <h1 className="display">Your workspace.</h1>
          <p>{me.user.email || "Guest workspace"}</p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={logout}
          disabled={leaving}
        >
          {leaving ? "Signing out…" : "Sign out"}
        </button>
      </div>
      {params.get("paid") && (
        <div className="account-payment-note" role="status">
          Checkout complete. Your balance updates when Stripe confirms payment.{" "}
          <button onClick={load}>Refresh balance</button>
        </div>
      )}
      {error && (
        <p role="alert" className="surface-message">
          {error}
        </p>
      )}
      <div className="account-grid">
        <section className="account-balance" aria-labelledby="credits-heading">
          <h2 id="credits-heading">Ready when you are</h2>
          <div className="account-credit-number">
            {me.user.credits}
            <span>credits</span>
          </div>
          <p>
            Enough for {Math.max(0, Math.floor(me.user.credits / 2))} preview{" "}
            {Math.max(0, Math.floor(me.user.credits / 2)) === 1
              ? "transition"
              : "transitions"}
            .
          </p>
          <Link href="/create" className="btn btn-primary">
            Create a transition <span aria-hidden="true">↗</span>
          </Link>
          <Link href="/pricing" className="account-add">
            Add credits
          </Link>
        </section>
        <section
          className="account-purchases"
          aria-labelledby="purchases-heading"
        >
          <h2 id="purchases-heading">Your credit purchases</h2>
          <p>One-time packs. No subscription.</p>
          {me.purchases.length === 0 ? (
            <div className="account-empty">
              No purchases yet.
              <br />
              <span>Your credit purchases will appear here.</span>
            </div>
          ) : (
            <ul>
              {me.purchases.map((purchase) => (
                <li key={purchase.id}>
                  <div>
                    <strong>{purchase.pack}</strong>
                    <span>{purchase.credits} credits</span>
                  </div>
                  <span>
                    {(purchase.amountCents / 100).toFixed(2)}{" "}
                    {purchase.currency.toUpperCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <Link href="/history" className="account-history">
        Find your previous transitions <span aria-hidden="true">↗</span>
      </Link>
    </div>
  );
}
