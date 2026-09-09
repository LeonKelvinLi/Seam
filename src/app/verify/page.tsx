"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
function Verify() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"working" | "ok" | "error">("working"); const [message, setMessage] = useState("");
  useEffect(() => {
    if (!token) { setState("error"); setMessage("This link is missing its token."); return; }
    api("/api/auth/verify", { method: "POST", json: { token } }).then(() => setState("ok")).catch((e) => { setState("error"); setMessage((e as Error).message); });
  }, [token]);
  return state === "working" ? <p className="mt-6 muted text-sm">Confirming…</p> : state === "ok"
    ? <p className="mt-6 text-sm">Your email is confirmed. <Link className="underline" href="/account">Go to your account</Link></p>
    : <p className="mt-6 text-sm text-red-300">{message} <Link className="underline" href="/account">Request a new link from your account</Link></p>;
}
export default function VerifyPage() {
  return (<div className="mx-auto max-w-sm px-5 pb-20 pt-16"><h1 className="display text-3xl">Email confirmation</h1><Suspense fallback={null}><Verify /></Suspense></div>);
}
