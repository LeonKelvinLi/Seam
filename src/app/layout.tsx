import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { NavUser } from "@/components/NavUser";
import { publicOrigin } from "@/lib/server/site";

const description = "Keep your footage. Generate only the transition between your shots.";
export const metadata: Metadata = {
  metadataBase: new URL(publicOrigin()),
  title: { default: "Clipmelt — AI Video Transitions", template: "%s" },
  description,
  applicationName: "Clipmelt",
  openGraph: { title: "Clipmelt", description, siteName: "Clipmelt", type: "website" },
  twitter: { card: "summary_large_image", title: "Clipmelt", description, images: ["/opengraph-image"] },
  robots: { index: true, follow: true },
};
export const viewport = { themeColor: "#0b0b0c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <header className="site-header">
          <nav className="site-nav" aria-label="Main navigation">
            <Link href="/" className="site-wordmark" aria-label="Clipmelt home">
              <img className="site-mark" src="/brand/seamcut-mark-256.png" alt="" width={28} height={28} aria-hidden="true" />
              Clipmelt
            </Link>
            <span className="site-nav-label mono">AI transition studio</span>
            <div className="site-nav-actions">
              <Link href="/library" className="site-nav-link">See what Clipmelt makes</Link>
              <Link href="/create" className="btn btn-primary btn-sm">Open studio <span aria-hidden="true">↗</span></Link>
            </div>
          </nav>
        </header>
        <main id="main-content" tabIndex={-1}>{children}</main>
        <footer className="site-footer">
          <Link href="/" className="site-footer-brand">Clipmelt</Link>
          <p>Two clips. Infinite possibilities.<br /><span className="muted">Footage stays yours.</span></p>
          <div className="site-footer-links"><Link href="/library">See what Clipmelt makes ↗</Link><Link href="/create">Open studio ↗</Link><Link href="/pricing">Pricing</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/refunds">Refunds</Link></div>
          <span className="site-footer-note mono">FRAME A → FRAME B</span>
        </footer>
      </body>
    </html>
  );
}
