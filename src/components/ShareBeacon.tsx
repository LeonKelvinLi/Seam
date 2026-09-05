"use client";
import { useEffect } from "react";
import { track } from "@/lib/api";
export function ShareBeacon({ id }: { id: string }) {
  useEffect(() => { track("share_view", { id }); }, [id]);
  return null;
}
