import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/server/site";

export const alt = "Clipmelt — AI video transitions between your clips";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "76px 88px", background: "#0b0b0c", color: "#f2f0ea", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24, color: "#e4bf6a", fontSize: 24, letterSpacing: 4 }}>
        <span>CLIP A</span><span>→</span><span>CLIP B</span>
      </div>
      <div style={{ fontSize: 112, fontWeight: 700, letterSpacing: -6, marginTop: 30 }}>{SITE_NAME}</div>
      <div style={{ fontSize: 42, marginTop: 16 }}>Make your clips flow together.</div>
      <div style={{ fontSize: 25, color: "#b8b6af", marginTop: 38 }}>AI video transitions. Your footage stays yours.</div>
    </div>,
    size,
  );
}
