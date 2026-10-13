import { ItemDetail } from "@/components/ItemDetail";
import { Sheet } from "@/components/Sheet";

export default async function ItemSheet({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Sheet key={id}>
      <ItemDetail id={id} />
    </Sheet>
  );
}
