import { Suspense } from "react";
import { CreateFlow } from "@/components/CreateFlow";
import { RECIPES } from "@/core/recipes/registry";
import { requirementSummary } from "@/core/opportunities/fit";

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-5 py-16 muted">Loading…</div>}>
      <CreateFlow styles={RECIPES.map((r) => ({ id: r.id, name: r.name, needs: requirementSummary(r.requirements) }))} />
    </Suspense>
  );
}
