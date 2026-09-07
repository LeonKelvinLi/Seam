"use client";
import Link from "next/link";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-5 pb-24 pt-24 text-center">
      <p className="mono text-xs muted">Something broke</p>
      <h1 className="display text-4xl mt-3">We dropped a frame.</h1>
      <p className="mt-3 muted">The page hit an error. Your projects and credits are safe.{error.digest ? ` Reference: ${error.digest}` : ""}</p>
      <div className="mt-8 flex justify-center gap-3"><button className="btn btn-primary" onClick={() => reset()}>Try again</button><Link href="/" className="btn">Home</Link></div>
    </div>
  );
}
