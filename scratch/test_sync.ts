import { pushSync, pullSync, getSyncStatus } from '../src/lib/sync/sync-service';

async function main() {
  console.log('Fetching initial status...');
  let status = await getSyncStatus();
  console.log('Initial Status:', status);

  console.log('\n--- Running pushSync() ---');
  try {
    const pushRes = await pushSync();
    console.log('Push Sync Result:', pushRes);
  } catch (e) {
    console.error('Push Sync Error:', e);
  }

  console.log('\n--- Running pullSync() ---');
  try {
    const pullRes = await pullSync();
    console.log('Pull Sync Result:', pullRes);
  } catch (e) {
    console.error('Pull Sync Error:', e);
  }

  console.log('\nFetching final status...');
  status = await getSyncStatus();
  console.log('Final Status:', status);
}

main().catch(console.error);
