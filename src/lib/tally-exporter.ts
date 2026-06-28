import { format } from "date-fns";

export interface TallySaleData {
  id: string;
  date: Date;
  voucherNumber: string;
  partyName: string;
  partyGstin?: string;
  sgstAmount: number;
  cgstAmount: number;
  totalAmount: number;
  items: {
    materialName: string;
    qty: number;
    rate: number;
    amount: number;
  }[];
}

export function generateTallyXML(sales: TallySaleData[]): string {
  const envelopeStart = `<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>Vouchers</REPORTNAME>
    <STATICVARIABLES>
     <SVCURRENTCOMPANY></SVCURRENTCOMPANY>
    </STATICVARIABLES>
   </REQUESTDESC>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">`;

  const envelopeEnd = `
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;

  let vouchersXml = "";

  for (const sale of sales) {
    const formattedDate = format(sale.date, "yyyyMMdd");
    const guid = sale.id;

    let itemsXml = "";
    
    for (const item of sale.items) {
      itemsXml += `
      <ALLINVENTORYENTRIES.LIST>
       <STOCKITEMNAME>${item.materialName}</STOCKITEMNAME>
       <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
       <RATE>${item.rate}/CFT</RATE>
       <AMOUNT>${item.amount.toFixed(2)}</AMOUNT>
       <ACTUALQTY> ${item.qty} CFT</ACTUALQTY>
       <BILLEDQTY> ${item.qty} CFT</BILLEDQTY>
       <ACCOUNTINGALLOCATIONS.LIST>
        <LEDGERNAME>GST SALES</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>${item.amount.toFixed(2)}</AMOUNT>
       </ACCOUNTINGALLOCATIONS.LIST>
      </ALLINVENTORYENTRIES.LIST>`;
    }

    const voucherXml = `
     <VOUCHER REMOTEID="${guid}" VCHKEY="${guid}" VCHTYPE="GST SALES" ACTION="Create" OBJVIEW="Invoice Voucher View">
      <DATE>${formattedDate}</DATE>
      <GUID>${guid}</GUID>
      <PARTYNAME>${sale.partyName}</PARTYNAME>
      <VOUCHERTYPENAME>GST SALES</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${sale.voucherNumber}</VOUCHERNUMBER>
      <PARTYLEDGERNAME>${sale.partyName}</PARTYLEDGERNAME>
      <BASICBASEPARTYNAME>${sale.partyName}</BASICBASEPARTYNAME>
      <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
      ${sale.partyGstin ? `<PARTYGSTIN>${sale.partyGstin}</PARTYGSTIN>\n      <CONSIGNEEGSTIN>${sale.partyGstin}</CONSIGNEEGSTIN>` : ""}
      <ISINVOICE>Yes</ISINVOICE>
      
      <!-- Party Ledger (Debtor) -->
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>${sale.partyName}</LEDGERNAME>
       <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
       <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
       <AMOUNT>-${sale.totalAmount.toFixed(2)}</AMOUNT>
      </LEDGERENTRIES.LIST>

      <!-- SGST Ledger -->
      ${sale.sgstAmount > 0 ? `
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>SGST</LEDGERNAME>
       <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
       <AMOUNT>${sale.sgstAmount.toFixed(2)}</AMOUNT>
      </LEDGERENTRIES.LIST>` : ""}

      <!-- CGST Ledger -->
      ${sale.cgstAmount > 0 ? `
      <LEDGERENTRIES.LIST>
       <LEDGERNAME>CGST</LEDGERNAME>
       <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
       <AMOUNT>${sale.cgstAmount.toFixed(2)}</AMOUNT>
      </LEDGERENTRIES.LIST>` : ""}

      <!-- Inventory Items (maps to Sales Ledger) -->
      ${itemsXml}
     </VOUCHER>`;
     
     vouchersXml += voucherXml;
  }

  return envelopeStart + vouchersXml + envelopeEnd;
}
