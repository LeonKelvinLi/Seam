import fs from "node:fs";
import path from "node:path";
import { bad, getUserId, json } from "@/lib/server/session";
import { Events, Projects } from "@/db/repo";
import { ingestFile } from "@/lib/server/ingest";
import { projectView } from "@/lib/server/views";

interface SamplePair { id: string; title: string; a: string; b: string }

function manifest(): SamplePair[] {
  const p = path.join(process.cwd(), "public", "samples", "manifest.json");
  if (!fs.existsSync(p)) return [];
  const list = JSON.parse(fs.readFileSync(p, "utf8")) as SamplePair[];
  return list.filter((s) => fs.existsSync(path.join(process.cwd(), "public", "samples", s.a)) && fs.existsSync(path.join(process.cwd(), "public", "samples", s.b)));
}

export async function GET() {
  return json({ samples: manifest().map((s) => ({ id: s.id, title: s.title, aUrl: `/samples/${s.a}`, bUrl: `/samples/${s.b}`, aPoster: `/samples/${s.a.replace(/\.mp4$/, ".jpg")}`, bPoster: `/samples/${s.b.replace(/\.mp4$/, ".jpg")}` })) });
}

const MIME: Record<string, string> = { ".mp4": "video/mp4", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mov": "video/quicktime" };

export async function POST(req: Request) {
  const userId = await getUserId();
  const { pairId } = (await req.json().catch(() => ({}))) as { pairId?: string };
  const pair = manifest().find((s) => s.id === pairId);
  if (!pair) return bad("Unknown sample");
  const isSecond = Projects.countForUser(userId) >= 1;
  const project = Projects.create(userId, pair.title);
  if (isSecond) Events.track("second_project_created", { userId, projectId: project.id });
  for (const [role, file] of [["start", pair.a], ["end", pair.b]] as const) {
    const abs = path.join(process.cwd(), "public", "samples", file);
    await ingestFile({ projectId: project.id, userId, role, buffer: fs.readFileSync(abs), originalName: file, mime: MIME[path.extname(file)] ?? "application/octet-stream" });
  }
  return json(projectView(project.id));
}
