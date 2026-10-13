/* eslint-disable @next/next/no-img-element -- edit-side thumbnails, some still pending (no dimensions yet) */
import Link from "next/link";
import type { EditThumb } from "@/lib/db/edit";

export function ThumbGrid({ items, actions }: { items: EditThumb[]; actions?: (item: EditThumb) => React.ReactNode }) {
  if (items.length === 0) return <p className="text-sm text-muted">Nothing here.</p>;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {items.map((item) => (
        <div key={item.id} className="group relative">
          <Link href={`/edit/items/${item.id}`} className="block aspect-square overflow-hidden rounded-sm bg-line">
            {item.image_url && <img src={item.image_url} alt={item.caption ?? ""} className={`h-full w-full object-cover ${item.hidden ? "opacity-40" : ""}`} loading="lazy" />}
          </Link>
          {actions && <div className="mt-1 flex flex-wrap gap-2 text-xs">{actions(item)}</div>}
        </div>
      ))}
    </div>
  );
}
