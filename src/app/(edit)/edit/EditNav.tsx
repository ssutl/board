"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/edit", label: "Drop & inbox", badge: "inbox" },
  { href: "/edit/loose", label: "Loose", badge: "loose" },
  { href: "/edit/boards", label: "Boards" },
  { href: "/edit/suggestions", label: "Suggestions", badge: "suggestions" },
  { href: "/edit/shortcut", label: "Shortcut" },
] as const;

export function EditNav({ badges }: { badges: { inbox: number; loose: number; suggestions: number } | null }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {TABS.map((t) => {
        const active = t.href === "/edit" ? path === "/edit" : path.startsWith(t.href);
        const count = "badge" in t && badges ? badges[t.badge] : 0;
        return (
          <Link key={t.href} href={t.href} className={`flex items-center justify-between gap-3 whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${active ? "bg-card font-medium" : "text-muted hover:text-ink"}`}>
            {t.label}
            {count > 0 && <span className="rounded-full bg-ink px-1.5 text-xs text-paper">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
