import { getUserId, json } from "@/lib/server/session";
import { Events, Projects } from "@/db/repo";
import { projectView } from "@/lib/server/views";

export async function POST() {
  const userId = await getUserId();
  const isSecond = Projects.countForUser(userId) >= 1;
  const project = Projects.create(userId);
  if (isSecond) Events.track("second_project_created", { userId, projectId: project.id });
  return json(projectView(project.id));
}
