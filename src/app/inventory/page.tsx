import { getInventoryStock } from "@/lib/domain/inventory/service";
import { InventoryPage } from "@/components/modules/inventory-page";

export const dynamic = "force-dynamic";

export default async function Page() {
  const stock = await getInventoryStock();
  return <InventoryPage initialStock={stock} />;
}
