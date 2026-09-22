import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { googleConfigured } from "@/lib/server/google";

// Rendered per request so the Google button follows the live environment, not the build.
export const dynamic = "force-dynamic";

export default function LoginPage() { return <Suspense fallback={null}><AuthForm mode="login" google={googleConfigured()} /></Suspense>; }
