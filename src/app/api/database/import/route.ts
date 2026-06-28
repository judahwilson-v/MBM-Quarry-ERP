import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getDatabaseFilePath } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('database') as File;
    
    if (!file) {
      return new NextResponse("No database file uploaded", { status: 400 });
    }

    const dbPath = getDatabaseFilePath();

    const buffer = Buffer.from(await file.arrayBuffer());
    
    fs.writeFileSync(dbPath, buffer);
    
    return NextResponse.json({ success: true, message: "Database imported successfully. Please restart the application." });
  } catch (error) {
    console.error("Import error:", error);
    return new NextResponse("Failed to import database", { status: 500 });
  }
}
