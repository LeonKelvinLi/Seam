import { bad, getUserId, json } from "@/lib/server/session";
import { generationHistory } from "@/lib/server/history";
import { Users } from "@/db/repo";

export async function GET(request: Request) {
  const userId = await getUserId();
  const cursor = new URL(request.url).searchParams.get("cursor");
  if (cursor && !/^gen_[a-z0-9]{12}$/.test(cursor)) return bad("Invalid history cursor");
  try {
    return json({ ...generationHistory(userId, cursor), isGuest: !Users.get(userId)?.email }, {
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid history cursor") return bad(error.message);
    throw error;
  }
}
