const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
const outputPath = path.join(__dirname, '../src/lib/sync/sync-map.json');

function generateSyncMap() {
  console.log('[Sync Map Generator] Reading schema.prisma...');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  const lines = schema.split('\n');
  const syncMap = {};

  let currentModel = null;

  for (let line of lines) {
    line = line.trim();

    // Match 'model ModelName {'
    const modelMatch = line.match(/^model\s+([a-zA-Z0-9_]+)\s*\{/);
    if (modelMatch) {
      currentModel = modelMatch[1];
      syncMap[currentModel] = {};
      continue;
    }

    if (currentModel && line === '}') {
      currentModel = null;
      continue;
    }

    if (currentModel && line.length > 0 && !line.startsWith('//') && !line.startsWith('@@')) {
      const parts = line.split(/\s+/);
      const fieldName = parts[0];
      
      let dbColumn = fieldName;
      const mapMatch = line.match(/@map\("([^"]+)"\)/);
      if (mapMatch) {
        dbColumn = mapMatch[1];
      }
      
      syncMap[currentModel][fieldName] = dbColumn;
    }
  }

  console.log(`[Sync Map Generator] Writing sync-map.json to ${outputPath}...`);
  fs.writeFileSync(outputPath, JSON.stringify(syncMap, null, 2));
  console.log('[Sync Map Generator] Done.');
}

generateSyncMap();
