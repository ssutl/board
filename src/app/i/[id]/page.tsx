import type { Metadata } from "next";
import Link from "next/link";
import { ItemDetail } from "@/components/ItemDetail";
import { getPublicItem } from "@/lib/db/public";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await getPublicItem((await params).id);
  if (!item) return {};
  return { title: item.title ?? item.caption ?? "Item", openGraph: { images: [item.image_url] } };
}

export default async function ItemPage({ params }: Props) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/" className="mb-6 inline-block text-sm text-muted hover:text-ink">
        ← All boards
      </Link>
      <ItemDetail id={id} />
    </main>
  );
}
