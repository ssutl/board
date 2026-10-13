import { cronAuthorized } from "@/lib/auth/request";
import { runSuggestions } from "@/lib/pipeline/suggest";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "Not allowed." }, { status: 401 });
  return Response.json({ opened: await runSuggestions() });
}
