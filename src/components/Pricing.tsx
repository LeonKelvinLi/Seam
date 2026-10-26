"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { GoogleButton } from "@/components/GoogleButton";
import { formatPackPrice, type DisplayPack as Pack } from "@/lib/money";

interface Me {
  user: { email: string | null; credits: number } | null;
  packs: Pack[];
  billing: { provider: string; checkout: boolean; links: string[]; webhook: boolean };
}

export function Pricing() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMe(await api<Me>("/api/auth/me"));
    } catch {
      setError(
        "Credit packs couldn't load. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const buy = async (pack: Pack) => {
    if (!me?.user) {
      router.push(`/signup?next=${encodeURIComponent("/pricing")}`);
      return;
    }
    setBusy(pack.id);
    setError(null);
    try {
      const r = await api<{ url: string }>("/api/payments/checkout", {
        method: "POST",
        json: { pack: pack.id },
      });
      window.location.href = r.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };
  const configured = Boolean(
    me && (me.billing.checkout || me.billing.links.length > 0),
  );
  return (
    <div className="pricing-shell">
      <div className="pricing-intro">
        <span className="page-kicker">Keep creating, on your terms</span>
        <h1 className="display">
          Great transitions.
          <br />
          Zero subscriptions.
        </h1>
        <p>
          Buy credits when inspiration hits. Use them when you’re ready.
          <br /> Every preview uses 2 credits. Your credits never expire.
        </p>
        <Link href="/create" className="pricing-trial">
          Start with one free preview <span aria-hidden="true">↗</span>
        </Link>
      </div>
      {loading && (
        <div className="pricing-loading" role="status">
          Loading credit packs…
        </div>
      )}
      {!loading && !me && (
        <div className="surface-message" role="alert">
          <p>{error}</p>
          <button className="btn btn-ghost" onClick={load}>
            Try again
          </button>
        </div>
      )}
      {me && (
        <>
          <div className="pricing-grid">
            {me.packs.map((pack, index) => (
              <article
                className="price-card"
                data-featured={index === 1}
                key={pack.id}
              >
                <div className="price-card-top">
                  <h2>{pack.name}</h2>
                  <span>
                    {index === 0
                      ? "Find your flow"
                      : index === 1
                        ? "Keep the ideas coming"
                        : "Room for the whole team"}
                  </span>
                </div>
                <div className="price-amount">
                  {formatPackPrice(pack)}
                  <span>{pack.currency} / one-time</span>
                </div>
                <div className="price-credit-count">{pack.credits} credits</div>
                <p className="price-preview-count">
                  Enough for{" "}
                  <strong>
                    {Math.floor(pack.credits / 2)} preview transitions
                  </strong>
                  .
                </p>
                <ul>
                  <li>AI transitions between your clips</li>
                  <li>Download the transition or full video</li>
                  <li>Credits returned if generation fails</li>
                  <li>No recurring charge</li>
                </ul>
                <button
                  className={`btn ${index === 1 ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => buy(pack)}
                  disabled={busy !== null || !configured}
                >
                  {busy === pack.id ? "Opening checkout…" : `Get ${pack.name}`}
                </button>
              </article>
            ))}
          </div>
          {me.billing.provider === "mercadopago" && configured && <p className="surface-message">Pay securely with Pix or cards through Mercado Pago.</p>}
          {!configured && (
            <p className="surface-message" role="status">
              Purchases are temporarily unavailable. Please try again later.
            </p>
          )}
          {error && (
            <p className="surface-message" role="alert">
              {error}
            </p>
          )}
          {!me.user && (
            <div className="pricing-signin">
              <span>Already have credits?</span>
              <GoogleButton next="/pricing" />
              <Link href="/login?next=%2Fpricing">Log in with email</Link>
            </div>
          )}
        </>
      )}
      <div className="pricing-explainer">
        <div>
          <h2>Pay for the connection.</h2>
          <p>
            Upload your two shots and choose a direction. We generate the frames
            between them. Each new preview, including another take or fine-tuned
            version, uses 2 credits.
          </p>
        </div>
        <div>
          <h2>Your clips. Your call.</h2>
          <p>
            Download the AI transition for your own edit, or take the combined
            video. If a generation cannot produce a video, its credits go back
            to your balance.
          </p>
        </div>
      </div>
    </div>
  );
}
