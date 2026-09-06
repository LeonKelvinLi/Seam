"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Me { user: { email: string | null; credits: number } | null }

export function NavUser() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { api<Me>("/api/auth/me").then(setMe).catch(() => setMe({ user: null })); }, []);
  if (!me) return null;
  if (!me.user) return <Link href="/login" className="btn btn-ghost btn-sm">Sign in</Link>;
  return <Link href="/account" className="btn btn-ghost btn-sm">{me.user.credits} credits</Link>;
}
