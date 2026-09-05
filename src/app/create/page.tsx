import { Suspense } from "react";
import { CreateFlow } from "@/components/CreateFlow";

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-5 py-16 muted">Loading…</div>}>
      <CreateFlow />
    </Suspense>
  );
}
