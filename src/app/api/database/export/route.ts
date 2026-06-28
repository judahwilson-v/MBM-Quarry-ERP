import { NextResponse } from 'next/server';
import fs from 'fs';
import { getDatabaseFilePath } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dbPath = getDatabaseFilePath();

    if (!fs.existsSync(dbPath)) {
      return new NextResponse("Database not found", { status: 404 });
    }

    const fileBuffer = fs.readFileSync(dbPath);
    
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Disposition': 'attachment; filename="quarry-export.db"',
        'Content-Type': 'application/octet-stream',
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return new NextResponse("Failed to export database", { status: 500 });
  }
}
