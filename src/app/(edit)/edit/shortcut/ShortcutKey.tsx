"use client";

import { useState, useTransition } from "react";
import { rotateDropKeyAction } from "../actions";

export function ShortcutKey() {
  const [key, setKey] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 text-sm">
      <button disabled={pending} onClick={() => start(async () => setKey(await rotateDropKeyAction()))} className="rounded-md bg-ink px-3 py-1.5 text-paper disabled:opacity-60">
        {pending ? "Generating…" : key ? "Generate another" : "Generate key"}
      </button>
      {key && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <code className="rounded bg-card px-2 py-1">{key}</code>
            <button onClick={() => navigator.clipboard.writeText(key)} className="underline">
              Copy
            </button>
          </div>
          <p className="text-muted">Shown once. Generating a new key stops the old one working.</p>
        </div>
      )}
    </div>
  );
}
