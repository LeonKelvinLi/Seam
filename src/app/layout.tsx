import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seam — turn any two clips into one impossible shot",
  description: "Upload two clips. AI figures out the transition.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-40 backdrop-blur-md" style={{ background: "rgba(9,9,10,0.7)" }}>
          <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} />
              Seam
            </Link>
            <div className="flex items-center gap-2">
              <Link href="/library" className="btn btn-ghost btn-sm">Library</Link>
              <Link href="/create" className="btn btn-primary btn-sm">Try it</Link>
            </div>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="mx-auto max-w-6xl px-5 py-10 text-xs muted">Seam · an AI transition director. Footage stays yours.</footer>
      </body>
    </html>
  );
}
