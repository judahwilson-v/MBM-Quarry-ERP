const path = require('path');
const fs = require('fs');

exports.default = async function(context) {
  const { appOutDir, packager } = context;
  const platform = packager.platform.name; // 'mac', 'windows', 'linux'
  
  let resourcesPath;
  if (platform === 'mac') {
    resourcesPath = path.join(appOutDir, packager.appInfo.productFilename + '.app', 'Contents', 'Resources');
  } else {
    resourcesPath = path.join(appOutDir, 'resources');
  }
  
  const destNodeModules = path.join(resourcesPath, 'standalone', 'node_modules');
  const srcNodeModules = path.join(__dirname, '..', '.next', 'standalone', 'node_modules');
  
  console.log(`[afterPack] Copying node_modules from ${srcNodeModules} to ${destNodeModules}`);
  
  if (fs.existsSync(srcNodeModules)) {
    if (fs.existsSync(destNodeModules)) {
      // Clear it if it exists to avoid old files
      fs.rmSync(destNodeModules, { recursive: true, force: true });
    }
    fs.mkdirSync(destNodeModules, { recursive: true });
    copyDirSync(srcNodeModules, destNodeModules);
    console.log('[afterPack] Successfully copied node_modules.');
  } else {
    console.warn('[afterPack] Source node_modules not found:', srcNodeModules);
  }

  // Strip absolute paths from server.js to prevent Windows crashes
  const serverJsPath = path.join(resourcesPath, 'standalone', 'server.js');
  if (fs.existsSync(serverJsPath)) {
    let serverJs = fs.readFileSync(serverJsPath, 'utf-8');
    
    // Replace absolute outputFileTracingRoot with __dirname
    serverJs = serverJs.replace(
      /"outputFileTracingRoot":\s*".*?"/g,
      '"outputFileTracingRoot": __dirname'
    );

    fs.writeFileSync(serverJsPath, serverJs, 'utf-8');
    console.log('[afterPack] Successfully stripped absolute paths from server.js.');
  }

  // Copy migrate.js
  const srcMigrate = path.join(__dirname, 'migrate.js');
  const destMigrate = path.join(resourcesPath, 'standalone', 'migrate.js');
  if (fs.existsSync(srcMigrate)) {
    fs.copyFileSync(srcMigrate, destMigrate);
    console.log('[afterPack] Successfully copied migrate.js.');
  }
};

function copyDirSync(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
