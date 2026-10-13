"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** The item opened over the page it was clicked from; Escape, the backdrop or Close go back. */
export function Sheet({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && router.back();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [router]);
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 backdrop-blur-sm" onClick={() => router.back()}>
      <div className="mx-auto my-4 max-w-5xl rounded-lg bg-paper p-4 md:my-10 md:p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => router.back()} className="mb-4 text-sm text-muted hover:text-ink">
          ← Close
        </button>
        {children}
      </div>
    </div>
  );
}
