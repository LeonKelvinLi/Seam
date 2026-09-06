import { Suspense } from "react";
import { Account } from "@/components/Account";

// Read billing env and cookies per request: never bake this page at build time.
export const dynamic = "force-dynamic";
export default function AccountPage() { return <Suspense fallback={null}><Account /></Suspense>; }
