/*
 * Phase 2 live-cloud contract test. It is read-only: all queries use
 * information_schema and pg_catalog and it never executes a migration.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import dns from 'dns/promises';
import { Client } from 'pg';
import { Prisma } from '@prisma/client';

type Column = { table_name: string; column_name: string; data_type: string; is_nullable: string };
type UniqueIndex = { table_name: string; columns: string[] };
type ForeignKey = { table_name: string; column_name: string; foreign_table_name: string; foreign_column_name: string };
type DeviationContract = {
  dateTime: { allowTimestampWithoutTimeZone: boolean };
  nullableRequiredColumns: Array<{ table: string; column: string }>;
};

const root = path.resolve(__dirname, '..');
const deviations = JSON.parse(
  fs.readFileSync(path.join(root, 'supabase', 'schema-contract-deviations.json'), 'utf8'),
) as DeviationContract;
const documentedNullable = new Set(deviations.nullableRequiredColumns.map((x) => `${x.table}.${x.column}`));
const typeFor = (field: { type: string }) => ({
  String: 'text',
  Int: 'integer',
  Float: 'double precision',
  Boolean: 'boolean',
  DateTime: 'timestamp with time zone',
  Json: 'jsonb',
  BigInt: 'bigint',
}[field.type] ?? 'text');

function tableName(model: (typeof Prisma.dmmf.datamodel.models)[number]) {
  return model.dbName ?? model.name;
}

function columnName(field: { dbName?: string | null; name: string }) {
  return field.dbName ?? field.name;
}

async function main() {
  if (process.argv.includes('--offline')) {
    console.log('Offline contract files are present. Run without --offline to query the live cloud read-only.');
    return;
  }

  const url = process.env.SUPABASE_DIRECT_URL;
  if (!url) throw new Error('SUPABASE_DIRECT_URL is required for the live parity test.');

  const connectionUrl = new URL(url);
  if (connectionUrl.hostname.endsWith('.supabase.co')) {
    try {
      const resolved = await dns.lookup(connectionUrl.hostname, { family: 6 });
      connectionUrl.hostname = resolved.address;
    } catch {
      // IPv6 not available on this network; use hostname directly
    }
  }

  const client = new Client({
    connectionString: connectionUrl.toString(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    // `pg` executes one query per client at a time. Keep this intentionally
    // sequential so parity checks remain compatible with pg 9 and later.
    const tableResult = await client.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name");
    const columnResult = await client.query<Column>("select table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position");
    const uniqueResult = await client.query<UniqueIndex>(`select c.relname as table_name, array_agg(a.attname order by key.ordinality) as columns
        from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace
        join lateral unnest(i.indkey) with ordinality as key(attnum, ordinality) on true
        join pg_attribute a on a.attrelid=c.oid and a.attnum=key.attnum
        where n.nspname='public' and i.indisunique
        group by c.relname, i.indexrelid`);
    const foreignKeyResult = await client.query<ForeignKey>(`select child.relname as table_name, child_column.attname as column_name,
          parent.relname as foreign_table_name, parent_column.attname as foreign_column_name
        from pg_constraint con
        join pg_class child on child.oid=con.conrelid
        join pg_namespace child_ns on child_ns.oid=child.relnamespace
        join pg_class parent on parent.oid=con.confrelid
        join lateral unnest(con.conkey) with ordinality as child_key(attnum, ordinality) on true
        join lateral unnest(con.confkey) with ordinality as parent_key(attnum, ordinality) on parent_key.ordinality=child_key.ordinality
        join pg_attribute child_column on child_column.attrelid=child.oid and child_column.attnum=child_key.attnum
        join pg_attribute parent_column on parent_column.attrelid=parent.oid and parent_column.attnum=parent_key.attnum
        where con.contype='f' and child_ns.nspname='public'`);
    const rlsResult = await client.query<{ table_name: string; rls_enabled: boolean }>("select c.relname as table_name, c.relrowsecurity as rls_enabled from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname");
    const policyResult = await client.query<{ tablename: string; policyname: string }>("select tablename, policyname from pg_policies where schemaname='public' order by tablename, policyname");

    const cloudTables = new Set(tableResult.rows.map((row) => row.table_name));
    const columns = new Map<string, Column>();
    for (const column of columnResult.rows) columns.set(`${column.table_name}.${column.column_name}`, column);
    const unique = new Set(
      uniqueResult.rows.map((row) => {
        const columns = Array.isArray(row.columns)
          ? row.columns
          : String(row.columns)
              .replace(/^{|}$/g, '')
              .split(',')
              .filter(Boolean);
        return `${row.table_name}.${columns.join(',')}`;
      }),
    );
    const foreignKeys = new Set(foreignKeyResult.rows.map((row) => `${row.table_name}.${row.column_name}->${row.foreign_table_name}.${row.foreign_column_name}`));

    const errors: string[] = [];
    const warnings: string[] = [];
    const models = Prisma.dmmf.datamodel.models;
    for (const model of models) {
      const table = tableName(model);
      if (!cloudTables.has(table)) {
        errors.push(`Missing cloud table: ${table}`);
        continue;
      }
      for (const field of model.fields.filter((f) => f.kind === 'scalar')) {
        const column = columnName(field);
        const actual = columns.get(`${table}.${column}`);
        if (!actual) {
          errors.push(`Missing cloud column: ${table}.${column}`);
          continue;
        }
        const expectedType = typeFor(field);
        const actualType = actual.data_type;
        const timestampDeviation = field.type === 'DateTime' && actualType === 'timestamp without time zone' && deviations.dateTime.allowTimestampWithoutTimeZone;
        if (actualType !== expectedType && !timestampDeviation) errors.push(`Type mismatch: ${table}.${column}; expected ${expectedType}, found ${actualType}`);
        if (timestampDeviation) warnings.push(`Documented timestamp deviation: ${table}.${column}`);
        if (field.isRequired && actual.is_nullable === 'YES') {
          const key = `${table}.${column}`;
          if (documentedNullable.has(key)) warnings.push(`Documented nullable-required deviation: ${key}`);
          else errors.push(`Nullability mismatch: ${key} is nullable in cloud but required by Prisma`);
        }
        if (field.isUnique && !field.isId && !unique.has(`${table}.${column}`)) errors.push(`Missing unique index: ${table}.${column}`);
      }
      for (const relation of model.fields.filter((f) => f.kind === 'object' && (f.relationFromFields?.length ?? 0) > 0)) {
        const relationFromField = relation.relationFromFields?.[0];
        if (!relationFromField) continue;
        const sourceField = model.fields.find((field) => field.name === relationFromField);
        const targetModel = models.find((candidate) => candidate.name === relation.type);
        if (!sourceField || !targetModel) continue;
        const expected = `${table}.${columnName(sourceField)}->${tableName(targetModel)}.id`;
        if (!foreignKeys.has(expected)) errors.push(`Missing foreign key: ${expected}`);
      }
    }

    const expectedTables = new Set(models.map(tableName));
    for (const table of cloudTables) {
      if (!expectedTables.has(table)) warnings.push(`Cloud-only public table: ${table}`);
    }
    console.log(`RLS inventory: ${rlsResult.rows.filter((row) => row.rls_enabled).length}/${rlsResult.rows.length} tables have RLS enabled; ${policyResult.rows.length} policies found.`);
    for (const warning of warnings) console.warn(`WARN: ${warning}`);
    if (errors.length) throw new Error(`Phase 2 parity failed:\n${errors.join('\n')}`);
    console.log(`Phase 2 parity passed for ${models.length} Prisma models.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
