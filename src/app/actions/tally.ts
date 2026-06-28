"use server";

import { getDb } from "@/lib/prisma";
import { generateTallyXML, TallySaleData } from "@/lib/tally-exporter";

export async function exportSalesToTallyXML(
  startDate: Date, 
  endDate: Date, 
  gstOnly: boolean
): Promise<{ success: boolean; xml?: string; error?: string }> {
  try {
    const prisma = await getDb();
    
    // Ensure endDate covers the whole day
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);

    const whereClause: any = {
      date: {
        gte: startDate,
        lte: endOfDay,
      }
    };

    if (gstOnly) {
      whereClause.gstEnabled = true;
    }

    const sales = await prisma.outgoingSale.findMany({
      where: whereClause,
      include: {
        party: true,
        material: true,
      },
      orderBy: {
        date: "asc"
      }
    });

    if (sales.length === 0) {
      return { success: false, error: "No sales found in the selected date range." };
    }

    const tallyData: TallySaleData[] = sales.map((sale) => {
      // Calculate item amount excluding GST
      const amountBeforeTax = sale.amount; // Base amount without taxes
      
      const materialName = sale.material?.name || sale.materialName || "Unknown Material";
      const partyName = sale.party?.name || sale.partyName || "CASH";
      const partyGst = sale.party?.gstNumber || undefined;
      const voucherNum = sale.bookNumber && sale.pageNumber 
        ? `${sale.bookNumber}/${sale.pageNumber}` 
        : `VCH-${sale.id.substring(0, 6)}`;

      return {
        id: sale.id,
        date: sale.date,
        voucherNumber: voucherNum,
        partyName: partyName,
        partyGstin: partyGst,
        sgstAmount: sale.sgst,
        cgstAmount: sale.cgst,
        totalAmount: sale.finalAmount, // The total debit to the party
        items: [
          {
            materialName: materialName,
            qty: sale.qty,
            rate: sale.rate,
            amount: amountBeforeTax
          }
        ]
      };
    });

    const xmlString = generateTallyXML(tallyData);
    
    return { success: true, xml: xmlString };
  } catch (error: any) {
    console.error("Tally Export Error:", error);
    return { success: false, error: error.message || "Failed to generate XML" };
  }
}
