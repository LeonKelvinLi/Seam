import { getUserId, bad, json } from "@/lib/server/session";
import { ingestFile } from "@/lib/server/ingest";
import { assetView, projectView } from "@/lib/server/views";
import { Events, Projects } from "@/db/repo";
import { ownedProject } from "@/lib/server/access";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const userId = await getUserId();
  let projectId = "";
  try {
    const form = await req.formData();
    const file = form.get("file");
    const role = String(form.get("role") ?? "");
    projectId = String(form.get("projectId") ?? "");
    if (!(file instanceof File)) return bad("No file received.");
    if (role !== "start" && role !== "end") return bad("role must be start or end");
    let project = projectId ? ownedProject(projectId, userId) : undefined;
    if (projectId && !project) return bad("Project not found", 404);
    if (!project) {
      const isSecond = Projects.countForUser(userId) >= 1;
      project = Projects.create(userId, file.name.replace(/\.[^.]+$/, ""));
      if (isSecond) Events.track("second_project_created", { userId, projectId: project.id });
    }
    projectId = project.id;
    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await ingestFile({ projectId, userId, role, buffer, originalName: file.name, mime: file.type || "application/octet-stream" });
    return json({ project: projectView(projectId)?.project, asset: assetView(asset), state: projectView(projectId) });
  } catch (e) {
    Events.track("upload_failed", { userId, projectId: projectId || null, props: { error: (e as Error).message } });
    return bad((e as Error).message ?? "Upload failed", 422);
  }
}
