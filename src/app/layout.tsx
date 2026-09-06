import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seam — turn any two clips into one impossible shot",
  description: "Keep your footage. Generate only the transition between your shots.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <header className="site-header">
          <nav className="site-nav" aria-label="Main navigation">
            <Link href="/" className="site-wordmark" aria-label="Seam home">
              <svg className="site-mark" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M4 4h9v9H4zM15 15h9v9h-9z" fill="currentColor" /><path d="M16 4h8v8M4 16v8h8" stroke="currentColor" strokeWidth="2" /></svg>
              seam<span className="site-wordmark-period">.</span>
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
          <Link href="/" className="site-footer-brand">seam<span>.</span></Link>
          <p>Two clips. Infinite possibilities.<br /><span className="muted">Footage stays yours.</span></p>
          <div className="site-footer-links"><Link href="/library">Transition library ↗</Link><Link href="/create">Open studio ↗</Link></div>
          <span className="site-footer-note mono">FRAME A → FRAME B</span>
        </footer>
      </body>
    </html>
  );
}
