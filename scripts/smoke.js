const { spawn } = require('child_process');
const http = require('http');

console.log("Starting Smoke Test...");

// We use Next.js dev server for a quick smoke test
const nextProcess = spawn('npx', ['next', 'dev', '-p', '3099'], {
  stdio: 'pipe',
  shell: true
});

let serverReady = false;

nextProcess.stdout.on('data', (data) => {
  const output = data.toString();
  if (output.includes('Ready in') || output.includes('started server on')) {
    serverReady = true;
  }
});

setTimeout(() => {
  if (!serverReady) {
    console.error("❌ Next.js failed to start within 15 seconds.");
    nextProcess.kill();
    process.exit(1);
  }

  console.log("Next.js started. Testing homepage...");
  
  http.get('http://localhost:3099', (res) => {
    if (res.statusCode === 200) {
      console.log("✅ Smoke Test Passed: Homepage returned 200 OK.");
      nextProcess.kill();
      process.exit(0);
    } else {
      console.error(`❌ Smoke Test Failed: Homepage returned ${res.statusCode}`);
      nextProcess.kill();
      process.exit(1);
    }
  }).on('error', (err) => {
    console.error(`❌ Smoke Test Failed: Could not connect to server. ${err.message}`);
    nextProcess.kill();
    process.exit(1);
  });
}, 15000); // Wait 15s for boot
