const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'node_modules', '.prisma', 'client');
const destDir = path.join(__dirname, '..', '.next', 'standalone', 'node_modules', '.prisma', 'client');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

if (fs.existsSync(srcDir)) {
  const files = fs.readdirSync(srcDir);
  let copied = 0;
  for (const file of files) {
    if (file.endsWith('.node')) {
      const srcFile = path.join(srcDir, file);
      const destFile = path.join(destDir, file);
      fs.copyFileSync(srcFile, destFile);
      console.log(`[Prisma Engine Copy] Copied ${file} to standalone build.`);
      copied++;
    }
  }
  if (copied === 0) {
    console.warn('[Prisma Engine Copy] No .node engine files found to copy.');
  }
} else {
  console.error('[Prisma Engine Copy] Source directory does not exist:', srcDir);
}
