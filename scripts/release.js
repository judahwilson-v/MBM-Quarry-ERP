const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const releaseType = process.argv[2];

if (!['patch', 'minor', 'major'].includes(releaseType)) {
  console.error('Error: Please specify a valid release type (patch, minor, major).');
  console.log('Usage: node scripts/release.js <type>');
  process.exit(1);
}

try {
  console.log(`Starting ${releaseType} release process...`);

  // 1. Run npm version which bumps package.json, creates a commit, and a tag
  // We use --no-git-tag-version first so we can stamp our own VERSION file and commit them together
  console.log('Bumping version in package.json...');
  execSync(`npm version ${releaseType} --no-git-tag-version`, { stdio: 'inherit' });

  // Read the new version
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
  const newVersion = packageJson.version;
  console.log(`New version is ${newVersion}`);

  // 2. Stamp the VERSION file
  console.log('Updating VERSION file...');
  const buildDate = new Date().toISOString();
  fs.writeFileSync(path.join(__dirname, '../VERSION'), `VERSION=${newVersion}\nBUILD_DATE=${buildDate}\n`);

  // 3. Commit and tag
  console.log('Committing changes...');
  execSync('git add package.json package-lock.json VERSION', { stdio: 'inherit' });
  execSync(`git commit -m "chore(release): v${newVersion}"`, { stdio: 'inherit' });

  console.log('Creating Git tag...');
  execSync(`git tag -a v${newVersion} -m "Release v${newVersion}"`, { stdio: 'inherit' });

  // 4. Push to remote
  console.log('Pushing to GitHub...');
  execSync('git push', { stdio: 'inherit' });
  execSync('git push --tags', { stdio: 'inherit' });

  console.log(`\n✅ Release v${newVersion} successfully pushed!`);
  console.log('GitHub Actions will now build and publish the Windows installer automatically.');
} catch (error) {
  console.error('\n❌ Release process failed.');
  console.error(error.message);
  process.exit(1);
}
