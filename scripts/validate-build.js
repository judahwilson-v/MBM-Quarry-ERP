const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');

function validateBuild() {
  console.log('[Build Validator] Checking required files for packaging...');
  
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('package.json not found in project root!');
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const buildConfig = pkg.build;
  
  if (!buildConfig) {
    console.warn('[Build Validator] No "build" configuration found in package.json.');
    return;
  }

  let missingFiles = [];

  // Check files array
  if (buildConfig.files && Array.isArray(buildConfig.files)) {
    for (const filePattern of buildConfig.files) {
      // In electron-builder, files can be globs, but we are just checking exact files defined.
      // We skip globs or directories for this simple validation, or just check if it exists.
      // E.g., "desktop/main.js", "desktop/preload.js"
      if (!filePattern.includes('*')) {
        const filePath = path.join(projectRoot, filePattern);
        if (!fs.existsSync(filePath)) {
          missingFiles.push(`Required build file missing: ${filePattern}`);
        }
      }
    }
  }

  // Check extraResources
  if (buildConfig.extraResources && Array.isArray(buildConfig.extraResources)) {
    for (const resource of buildConfig.extraResources) {
      if (resource.from && !resource.from.includes('*')) {
        const filePath = path.join(projectRoot, resource.from);
        if (!fs.existsSync(filePath)) {
          missingFiles.push(`Required extraResource missing: ${resource.from}`);
        }
      }
    }
  }

  if (missingFiles.length > 0) {
    console.error('\n❌ BUILD VALIDATION FAILED ❌');
    missingFiles.forEach(err => console.error(` - ${err}`));
    console.error('\nPlease ensure all required files are generated before packaging.');
    process.exit(1);
  } else {
    console.log('[Build Validator] All critical files are present. Build is safe to proceed. ✅');
  }
}

validateBuild();
