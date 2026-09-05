import { Suspense } from "react";
import { Library } from "@/components/Library";

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-5 py-16 muted">Loading…</div>}>
      <Library />
    </Suspense>
  );
}
