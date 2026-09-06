import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { NavUser } from "@/components/NavUser";

export const metadata: Metadata = {
  title: "SeamCut — turn any two clips into one impossible shot",
  description: "Keep your footage. Generate only the transition between your shots.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <header className="site-header">
          <nav className="site-nav" aria-label="Main navigation">
            <Link href="/" className="site-wordmark" aria-label="SeamCut home">
              <img className="site-mark" src="/brand/seamcut-mark-256.png" alt="" width={28} height={28} aria-hidden="true" />
              SeamCut
            </Link>
            <span className="site-nav-label mono">AI transition studio</span>
            <div className="site-nav-actions">
              <Link href="/library" className="site-nav-link" aria-label="Transition library">Explore transitions</Link>
              <Link href="/create" className="btn btn-primary btn-sm">Open studio <span aria-hidden="true">↗</span></Link>
            </div>
          </nav>
        </header>
        <main id="main-content" tabIndex={-1}>{children}</main>
        <footer className="site-footer">
          <Link href="/" className="site-footer-brand">SeamCut</Link>
          <p>Two clips. Infinite possibilities.<br /><span className="muted">Footage stays yours.</span></p>
          <div className="site-footer-links"><Link href="/library">Transition library ↗</Link><Link href="/create">Open studio ↗</Link></div>
          <span className="site-footer-note mono">FRAME A → FRAME B</span>
        </footer>
      </body>
    </html>
  );
}
