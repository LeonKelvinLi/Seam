import Link from "next/link";
export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-5 pb-24 pt-24 text-center">
      <p className="mono text-xs muted">404</p>
      <h1 className="display text-4xl mt-3">That cut doesn't exist.</h1>
      <p className="mt-3 muted">The page or share link you followed has moved or was never rendered.</p>
      <div className="mt-8 flex justify-center gap-3"><Link href="/" className="btn btn-primary">Back to Clipmelt</Link><Link href="/create" className="btn">Open studio</Link></div>
    </div>
  );
}
