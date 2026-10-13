"use client";

import { useEffect, useRef } from "react";

/** GET /search?q=…; "/" focuses it from anywhere on the page. */
export function SearchBox({ defaultValue = "" }: { defaultValue?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form action="/search" className="w-full max-w-xs">
      <input
        ref={ref}
        name="q"
        defaultValue={defaultValue}
        maxLength={200}
        placeholder="Search by feel…  /"
        className="w-full rounded-md border border-edge bg-card px-3 py-1.5 text-sm outline-none focus:border-ink"
      />
    </form>
  );
}
