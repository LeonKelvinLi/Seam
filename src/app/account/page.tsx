import { Suspense } from "react";
import { Account } from "@/components/Account";
export default function AccountPage() { return <Suspense fallback={null}><Account /></Suspense>; }
