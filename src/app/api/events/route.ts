import { bad, getUserId, json } from "@/lib/server/session";
import { Events, Users } from "@/db/repo";

const ALLOWED = new Set(["visit", "landing_view", "upload_started", "example_switched", "library_view", "share_view", "cta_click", "paywall_shown"]);
const TOUCH_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "referrer", "path", "device"] as const;

/** Flat, short, primitive props only: analytics must not become a place to store arbitrary data. */
function clean(props: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!props || typeof props !== "object") return out;
  for (const [k, v] of Object.entries(props as Record<string, unknown>).slice(0, 16)) {
    if (!/^[a-z_]{1,32}$/i.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 160);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

export async function POST(req: Request) {
  const userId = await getUserId();
  const body = (await req.json().catch(() => ({}))) as { name?: string; projectId?: string; generationId?: string; props?: unknown };
  if (!body.name || !ALLOWED.has(body.name)) return bad("unknown event");
  const props = clean(body.props);
  if (body.name === "visit") {
    const touch: Record<string, string> = { at: new Date().toISOString() };
    for (const k of TOUCH_KEYS) if (typeof props[k] === "string" && props[k]) touch[k === "path" ? "landing" : k] = props[k] as string;
    touch.source = touch.utm_source || (touch.ref ? "ref" : touch.referrer || "direct");
    Users.setFirstTouch(userId, touch);
  }
  Events.track(body.name, { userId, projectId: body.projectId ?? null, generationId: body.generationId ?? null, props });
  return json({ ok: true });
}
