import { stopAt } from "@/lib/ai/budget";
import { cronAuthorized } from "@/lib/auth/request";
import { sweep } from "@/lib/pipeline/sweep";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "Not allowed." }, { status: 401 });
  const now = Date.now();
  return Response.json(await sweep(stopAt({ now, deadline: now + 300_000, margin: 60_000 })));
}
