import { bad, getUserId, json } from "@/lib/server/session";
import { Events, Generations, Learning } from "@/db/repo";

const ACTIONS = new Set(["download_full", "download_bridge", "share", "copy_link", "export_failed"]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = await getUserId();
  const g = Generations.get(id);
  if (!g) return bad("Generation not found", 404);
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (!action || !ACTIONS.has(action)) return bad("unknown action");
  if (action.startsWith("download")) { Learning.flag(id, "userDownloaded"); Events.track("downloaded", { userId, projectId: g.projectId, generationId: id, props: { kind: action } }); }
  if (action === "share" || action === "copy_link") { Learning.flag(id, "userShared"); Events.track("shared", { userId, projectId: g.projectId, generationId: id, props: { kind: action } }); }
  if (action === "export_failed") Events.track("export_failed", { userId, projectId: g.projectId, generationId: id });
  return json({ ok: true });
}
