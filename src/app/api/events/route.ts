import { bad, getUserId, json } from "@/lib/server/session";
import { Events } from "@/db/repo";

const ALLOWED = new Set(["landing_view", "upload_started", "example_switched", "library_view", "share_view", "cta_click"]);

export async function POST(req: Request) {
  const userId = await getUserId();
  const body = (await req.json().catch(() => ({}))) as { name?: string; projectId?: string; generationId?: string; props?: Record<string, unknown> };
  if (!body.name || !ALLOWED.has(body.name)) return bad("unknown event");
  Events.track(body.name, { userId, projectId: body.projectId ?? null, generationId: body.generationId ?? null, props: body.props ?? {} });
  return json({ ok: true });
}
