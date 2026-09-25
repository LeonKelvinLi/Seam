"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";

export function MobileNav() {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menu.current?.contains(event.target) &&
        menu.current
      )
        menu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details ref={menu} className="site-mobile-menu">
      <summary aria-label="Open navigation">Menu</summary>
      <div>
        {[
          ["/#examples", "Examples"],
          ["/#how-it-works", "How it works"],
          ["/library", "Transition library"],
          ["/pricing", "Pricing"],
          ["/history", "My transitions"],
        ].map(([href, title]) => (
          <Link
            key={href}
            href={href}
            onClick={() => {
              if (menu.current) menu.current.open = false;
            }}
          >
            {title}
            <span aria-hidden="true">↗</span>
          </Link>
        ))}
      </div>
    </details>
  );
}
