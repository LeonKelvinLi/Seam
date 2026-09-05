"use client";
import { useEffect } from "react";
import { track } from "@/lib/api";

export function LandingBeacon() {
  useEffect(() => { track("landing_view", { path: location.pathname }); }, []);
  return null;
}
