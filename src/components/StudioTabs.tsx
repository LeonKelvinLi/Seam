import Link from "next/link";

export function StudioTabs({ active }: { active: "create" | "history" }) {
  return <nav className="studio-tabs" aria-label="Studio sections">
    <Link href="/create" aria-current={active === "create" ? "page" : undefined}>Create transition</Link>
    <Link href="/history" aria-current={active === "history" ? "page" : undefined}>Previous generations</Link>
  </nav>;
}
