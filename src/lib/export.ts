import * as XLSX from 'xlsx';
import { format } from 'date-fns';

/**
 * Generic function to export an array of objects to an Excel (.xlsx) file
 * @param data Array of objects representing rows
 * @param filename Name of the file (without extension)
 * @param sheetName Name of the sheet inside the Excel file
 */
export function exportToExcel<T extends Record<string, any>>(
  data: T[],
  filename: string,
  sheetName: string = 'Sheet1'
) {
  // Create a new workbook
  const wb = XLSX.utils.book_new();
  
  // Convert JSON to worksheet
  const ws = XLSX.utils.json_to_sheet(data);
  
  // Auto-size columns based on header and content length
  const colWidths = getColWidths(data);
  ws['!cols'] = colWidths;
  
  // Append worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  
  // Generate Excel file and trigger download
  XLSX.writeFile(wb, `${filename}_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`);
}

/**
 * Calculates approximate column widths for better Excel readability
 */
function getColWidths<T extends Record<string, any>>(data: T[]) {
  if (data.length === 0) return [];
  
  const headers = Object.keys(data[0]);
  const widths = headers.map(header => {
    // Start with header length
    let maxWidth = header.length;
    
    // Check all rows for this column's max length
    data.forEach(row => {
      const val = row[header];
      if (val !== null && val !== undefined) {
        const valStr = String(val);
        if (valStr.length > maxWidth) {
          maxWidth = valStr.length;
        }
      }
    });
    
    // Add a little padding, cap at 50 chars
    return { wch: Math.min(maxWidth + 2, 50) };
  });
  
  return widths;
}
