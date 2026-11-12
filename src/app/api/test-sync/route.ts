import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
// A GET endpoint must not create test sales, run real sync or obtain an
// administrator client. Live acceptance uses an explicit private test run.
export async function GET() {
  return NextResponse.json({success:false,error:'This legacy mutation diagnostic is disabled.'},{status:410});
}
