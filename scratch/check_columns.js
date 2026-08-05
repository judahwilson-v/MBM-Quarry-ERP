const { Client } = require('pg');
// Use pooler URL (port 5432 direct)
const c = new Client('postgresql://postgres.slgkzhchczgvfhryejqu:judahvijaiwilson@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres');
c.connect().then(async () => {
  const r = await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='outgoing_sales' ORDER BY ordinal_position");
  console.log('outgoing_sales columns:');
  console.log(r.rows.map(x => x.column_name).join('\n'));
  
  const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  console.log('\nAll public tables:');
  console.log(t.rows.map(x => x.table_name).join('\n'));
  
  c.end();
}).catch(e => { console.error(e.message); c.end(); });
