const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const versionFilePath = path.join(__dirname, '..', 'VERSION');

try {
  const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = packageData.version;
  
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  
  const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}`;

  const content = `VERSION=${version}\nBUILD_DATE=${formattedDate}\n`;
  
  fs.writeFileSync(versionFilePath, content, 'utf8');
  console.log(`\x1b[32mSuccessfully stamped VERSION file: v${version} at ${formattedDate}\x1b[0m`);
} catch (error) {
  console.error('\x1b[31mFailed to stamp VERSION file:\x1b[0m', error);
  process.exit(1);
}
