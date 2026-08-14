const { PrismaClient } = require('@prisma/client');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

async function main() {
  const prisma = new PrismaClient();
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 3 });
  
  console.log('--- LATEST LOCAL AUDIT LOGS ---');
  console.log(logs.map(l => ({ table: l.entityType, action: l.action, id: l.entityId, timestamp: l.createdAt })));
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.log('Missing Supabase keys in env');
    return;
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  console.log('\n--- FETCHING LATEST FROM SUPABASE ---');
  
  for (const log of logs) {
    const table = log.entityType;
    if (table) {
      const { data, error } = await supabase.from(table).select('*').eq('id', log.entityId).single();
      if (error) {
         console.log(`Error fetching ${table}:${log.entityId} - ${error.message}`);
      } else {
         console.log(`\n☁️ CLOUD DATA FOR ${table} (${log.action}):`, data);
      }
    }
  }
}
main().catch(console.error).finally(() => process.exit(0));
