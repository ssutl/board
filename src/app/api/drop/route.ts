import { after } from "next/server";
import { dropAuthorized } from "@/lib/auth/request";
import { handleDrop } from "@/lib/capture/drop";
import { MAX_UPLOAD_BYTES } from "@/lib/config";
import { growBoards } from "@/lib/pipeline/grow";
import { processItem } from "@/lib/pipeline/process";

// The response returns at once; processing continues in after() within this budget.
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await dropAuthorized(req))) return Response.json({ error: "Not allowed." }, { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 1024 * 1024)
    return Response.json({ error: "That file is over 15 MB." }, { status: 413 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Send multipart form data." }, { status: 400 });
  }
  const result = await handleDrop(form);
  const id = result.processId;
  if (id)
    after(async () => {
      await processItem(id);
      await growBoards();
    });
  return Response.json(result.body, { status: result.status });
}
