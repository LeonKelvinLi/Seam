import type { Metadata } from "next";
import Link from "next/link";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import { Attribution } from "@/components/Attribution";
import "./globals.css";
import { publicOrigin } from "@/lib/server/site";
import { MobileNav } from "@/components/MobileNav";
import { NavUser } from "@/components/NavUser";

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const bodyFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const description =
  "Keep your footage. Generate only the transition between your shots.";
export const metadata: Metadata = {
  metadataBase: new URL(publicOrigin()),
  title: { default: "Clipmelt — AI Video Transitions", template: "%s" },
  description,
  applicationName: "Clipmelt",
  openGraph: {
    title: "Clipmelt",
    description,
    siteName: "Clipmelt",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clipmelt",
    description,
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true },
};
export const viewport = { themeColor: "#050608" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable}`}>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Attribution />
        <header className="site-header">
          <nav className="site-nav" aria-label="Main navigation">
            <Link href="/" className="site-wordmark" aria-label="Clipmelt home">
              <img
                className="site-mark"
                src="/brand/seamcut-mark-256.png"
                alt=""
                width={28}
                height={28}
                aria-hidden="true"
              />
              Clipmelt
            </Link>
            <div className="site-nav-center">
              <Link href="/#examples" className="site-nav-link">
                Examples
              </Link>
              <Link href="/#how-it-works" className="site-nav-link">
                How it works
              </Link>
              <Link href="/pricing" className="site-nav-link">
                Pricing
              </Link>
            </div>
            <div className="site-nav-actions">
              <MobileNav />
              <Link
                href="/history"
                className="site-nav-link site-history-link"
                data-mobile-label="History"
              >
                My transitions
              </Link>
              <NavUser />
              <Link
                href="/create"
                data-cta="header_studio"
                className="btn btn-primary btn-sm"
              >
                Create <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </nav>
        </header>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="site-footer">
          <div className="site-footer-intro">
            <Link href="/" className="site-footer-brand">
              Clipmelt
            </Link>
            <p>
              AI transitions between your clips.
              <br />
              <span className="muted">
                You bring the footage. We connect it.
              </span>
            </p>
          </div>
          <div className="site-footer-links">
            <span>Make something</span>
            <Link href="/create">Create a transition</Link>
            <Link href="/library">Transition library</Link>
            <Link href="/pricing">Credit packs</Link>
          </div>
          <div className="site-footer-links">
            <span>Your workspace</span>
            <Link href="/history">My transitions</Link>
            <Link href="/account">Account</Link>
            <Link href="/login">Log in</Link>
          </div>
          <div className="site-footer-links">
            <span>The details</span>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/refunds">Refunds</Link>
          </div>
          <div className="site-footer-bottom">
            <span>© {new Date().getFullYear()} Clipmelt</span>
            <span>The moments are yours. So is the story.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
