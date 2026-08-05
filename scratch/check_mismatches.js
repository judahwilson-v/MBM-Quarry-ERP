// Check which fields have mismatched snake_case vs @map values
const fs = require('fs');
const schema = fs.readFileSync('d:/mbm file/project/MBM1/prisma/schema.prisma', 'utf-8');

function naiveSnakeCase(camel) {
  return camel.replace(/([A-Z])/g, '_$1').toLowerCase();
}

const lines = schema.split('\n');
const mismatches = [];
let currentModel = null;

for (const line of lines) {
  const modelMatch = line.match(/^model\s+(\w+)/);
  if (modelMatch) { currentModel = modelMatch[1]; continue; }
  if (line.trim() === '}') { currentModel = null; continue; }
  
  const fieldMatch = line.match(/^\s+(\w+)\s+\S+.*@map\("([^"]+)"\)/);
  if (fieldMatch && currentModel) {
    const [, fieldName, mapName] = fieldMatch;
    const naiveSnake = naiveSnakeCase(fieldName);
    if (naiveSnake !== mapName) {
      mismatches.push({ model: currentModel, field: fieldName, mapName, naiveSnake });
    }
  }
}

if (mismatches.length === 0) {
  console.log('No mismatches found');
} else {
  console.log('MISMATCHES between naive toSnakeCase and @map:');
  for (const m of mismatches) {
    console.log(`  ${m.model}.${m.field}: toSnakeCase="${m.naiveSnake}" but @map="${m.mapName}"`);
  }
}
