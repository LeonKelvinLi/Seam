import { Pricing } from "@/components/Pricing";

// Read billing env and cookies per request: never bake this page at build time.
export const dynamic = "force-dynamic";
export default function PricingPage() { return <Pricing />; }
