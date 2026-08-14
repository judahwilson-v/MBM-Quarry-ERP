const { Client } = require('pg');

async function run() {
  const connectionString = 'postgresql://postgres:judahvijaiwilson@db.slgkzhchczgvfhryejqu.supabase.co:5432/postgres';
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Successfully connected to Supabase PostgreSQL.");
    
    const res = await client.query('SELECT NOW() AS current_time;');
    console.log("Query executed successfully. Result:");
    console.log(res.rows);
  } catch (err) {
    console.error("Error executing query:", err.message);
  } finally {
    await client.end();
  }
}

run();
