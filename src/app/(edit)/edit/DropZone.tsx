"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Entry = { label: string; message: string; ok: boolean };

function describe(status: number, data: { duplicate?: boolean; blocked?: boolean; kind?: string; error?: string }): Entry["message"] {
  if (status >= 400) return data.error ?? `Failed (${status})`;
  if (data.duplicate) return "Already saved";
  if (data.blocked) return "Saved as a link. Screenshot it instead.";
  if (data.kind === "link") return "No image found. Saved as a link card.";
  return "Saved, sorting…";
}

/** ⌘V anywhere on the page, drag files in, or paste a link into the box. Posts to /api/drop with the session cookie. */
export function DropZone() {
  const router = useRouter();
  const [log, setLog] = useState<Entry[]>([]);
  const [url, setUrl] = useState("");
  const [over, setOver] = useState(false);

  const send = useCallback(
    async (label: string, field: "file" | "url", value: Blob | string) => {
      const body = new FormData();
      body.append(field, value);
      const res = await fetch("/api/drop", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      setLog((l) => [{ label, message: describe(res.status, data), ok: res.ok }, ...l].slice(0, 20));
      router.refresh();
    },
    [router],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) {
        e.preventDefault();
        files.forEach((f) => send(f.name || "Pasted image", "file", f));
        return;
      }
      const text = e.clipboardData?.getData("text")?.trim() ?? "";
      if (/^https?:\/\//i.test(text) && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        send(text, "url", text);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [send]);

  return (
    <section className="mb-10">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          [...e.dataTransfer.files].forEach((f) => send(f.name, "file", f));
        }}
        className={`flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center text-sm ${over ? "border-ink bg-card" : "border-edge text-muted"}`}
      >
        <p>Paste (⌘V) a screenshot or link anywhere on this page, or drop images here.</p>
        <form
          className="flex w-full max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) send(url.trim(), "url", url.trim());
            setUrl("");
          }}
        >
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="flex-1 rounded-md border border-edge bg-card px-3 py-1.5 outline-none focus:border-ink" />
          <button className="rounded-md bg-ink px-3 py-1.5 text-paper">Add</button>
        </form>
      </div>
      {log.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {log.map((entry, i) => (
            <li key={i} className={entry.ok ? "" : "text-red-700"}>
              <span className="text-muted">{entry.label.slice(0, 60)}</span> {entry.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
