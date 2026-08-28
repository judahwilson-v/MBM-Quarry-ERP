const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '../prisma/schema.prisma');
const outputPath = path.join(__dirname, '../prisma/schema_pg.prisma');

const HEADER = '// AUTO-GENERATED from schema.prisma — DO NOT EDIT MANUALLY\n';

// Regex to detect a DateTime field line (not a relation).
// Matches lines like:  createdAt  DateTime  @default(now())
// A DateTime field line contains the word "DateTime" as a type token.
const dateTimeFieldRegex = /^\s+\w+\s+DateTime[\s?]/;

function transformLine(line) {
  // 1. Provider swap: sqlite → postgresql
  if (/provider\s*=\s*"sqlite"/.test(line)) {
    return line.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
  }

  // 2. URL swap: file-based SQLite URL → env("SUPABASE_DIRECT_URL")
  if (/url\s*=\s*"file:/.test(line)) {
    return line.replace(/url\s*=\s*"file:[^"]*"/, 'url      = env("SUPABASE_DIRECT_URL")');
  }

  // 3. Remove binaryTargets line
  if (/binaryTargets/.test(line)) {
    return null; // signal to skip
  }

  // 4. Default UUID / CUID → dbgenerated("gen_random_uuid()")
  let transformed = line;
  if (/@default\(uuid\(\)\)/.test(transformed)) {
    transformed = transformed.replace(
      /@default\(uuid\(\)\)/g,
      '@default(dbgenerated("gen_random_uuid()"))'
    );
  }
  if (/@default\(cuid\(\)\)/.test(transformed)) {
    transformed = transformed.replace(
      /@default\(cuid\(\)\)/g,
      '@default(dbgenerated("gen_random_uuid()"))'
    );
  }

  // 5. DateTime fields: append @db.Timestamptz if not already present
  if (dateTimeFieldRegex.test(transformed) && !transformed.includes('@db.Timestamptz')) {
    // Check if there's a trailing comment
    const commentMatch = transformed.match(/(\s*\/\/.*)$/);
    if (commentMatch) {
      // Insert @db.Timestamptz before the trailing comment
      const commentStart = transformed.lastIndexOf(commentMatch[1]);
      transformed =
        transformed.slice(0, commentStart).trimEnd() +
        ' @db.Timestamptz ' +
        commentMatch[1].trimStart();
      // Reconstruct with proper spacing
      const beforeComment = transformed.slice(0, transformed.lastIndexOf('//'));
      const comment = transformed.slice(transformed.lastIndexOf('//'));
      transformed = beforeComment.trimEnd() + ' ' + comment;
    } else {
      transformed = transformed.trimEnd() + ' @db.Timestamptz';
    }
  }

  return transformed;
}

function generate() {
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Input schema not found: ${inputPath}`);
    process.exit(1);
  }

  const input = fs.readFileSync(inputPath, 'utf-8');
  const lines = input.split('\n');

  const outputLines = [];
  let providerSwapped = false;
  let urlSwapped = false;
  let binaryTargetsRemoved = false;
  let uuidDefaultsReplaced = 0;
  let dateTimeAnnotations = 0;

  for (const line of lines) {
    const result = transformLine(line);

    if (result === null) {
      // Line was skipped (binaryTargets)
      binaryTargetsRemoved = true;
      continue;
    }

    if (result !== line) {
      // Something changed — track what
      if (/provider\s*=\s*"postgresql"/.test(result)) providerSwapped = true;
      if (/SUPABASE_DIRECT_URL/.test(result)) urlSwapped = true;
      if (/dbgenerated\("gen_random_uuid\(\)"\)/.test(result)) uuidDefaultsReplaced++;
      if (/@db\.Timestamptz/.test(result) && !/@db\.Timestamptz/.test(line)) dateTimeAnnotations++;
    }

    outputLines.push(result);
  }

  const output = HEADER + '\n' + outputLines.join('\n');
  if (process.argv.includes('--check')) {
    const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf-8') : null;
    if (existing !== output) {
      console.error('❌ PostgreSQL schema is stale. Run node scripts/generate-pg-schema.js and commit prisma/schema_pg.prisma.');
      process.exit(1);
    }
    console.log('✅ PostgreSQL schema is reproducible and current.');
    return;
  }

  fs.writeFileSync(outputPath, output, 'utf-8');

  console.log('✅ PostgreSQL schema generated successfully!');
  console.log(`   Input:  ${inputPath}`);
  console.log(`   Output: ${outputPath}`);
  console.log('');
  console.log('Transformations applied:');
  console.log(`   Provider swap (sqlite → postgresql): ${providerSwapped ? '✔' : '—'}`);
  console.log(`   URL swap → env("SUPABASE_DIRECT_URL"): ${urlSwapped ? '✔' : '—'}`);
  console.log(`   binaryTargets line removed: ${binaryTargetsRemoved ? '✔' : '—'}`);
  console.log(`   @default(uuid/cuid) → dbgenerated: ${uuidDefaultsReplaced} replacement(s)`);
  console.log(`   DateTime @db.Timestamptz added: ${dateTimeAnnotations} field(s)`);
}

generate();
