const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = 3005;

// Check if a port is in use
function checkPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') resolve(true);
      else resolve(false);
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

// Check if the service on the port is our Next.js app
function checkIsNextJs(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/`, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        // If the HTML includes our app title or Next.js specific tags, we can reuse it
        if (data.includes('MBM Quarry') || data.includes('_next') || res.headers['x-powered-by'] === 'Next.js') {
          resolve(true);
        } else {
          resolve(false); 
        }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.abort();
      resolve(false);
    });
  });
}

// Wait for Next.js to be ready and responding
function waitForServer(port) {
  return new Promise((resolve) => {
    process.stdout.write(`Waiting for Next.js server on port ${port} to be ready...`);
    const interval = setInterval(() => {
      const req = http.get(`http://localhost:${port}/`, (res) => {
        if (res.statusCode === 200) { // Next.js returns 200 when ready
          clearInterval(interval);
          console.log(' Ready!');
          resolve();
        }
      });
      req.on('error', () => { 
        process.stdout.write('.'); // Print dot to show waiting progress
      });
    }, 1000);
  });
}

// Find an available port, or reuse our existing dev server port
async function findAvailablePort(startPort) {
  let port = startPort;
  while (await checkPortInUse(port)) {
    if (await checkIsNextJs(port)) {
      return { port, reused: true };
    }
    console.log(`Port ${port} is in use by another process. Trying port ${port + 1}...`);
    port++;
  }
  return { port, reused: false };
}

(async () => {
  try {
    const { port, reused } = await findAvailablePort(DEFAULT_PORT);
    
    let nextProcess = null;
    if (reused) {
      console.log(`\n✅ Found existing Next.js dev server on port ${port}. Reusing it!`);
    } else {
      console.log(`\n🧹 Clearing stale Next.js cache to prevent chunk loading errors...`);
      try {
        fs.rmSync(path.join(__dirname, '..', '.next'), { recursive: true, force: true });
      } catch (e) {
        // ignore
      }

      console.log(`🚀 Starting new Next.js dev server on port ${port}...`);
      
      // Start Next.js using npx to avoid issues with package.json scripts
      nextProcess = spawn('npx', ['next', 'dev', '-p', port.toString()], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: { ...process.env, PORT: port.toString() }
      });
      
      // Pipe Next.js output to our console with a prefix
      nextProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
          if (line.trim()) console.log(`[Next.js] ${line}`);
        });
      });
      
      nextProcess.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
          if (line.trim()) console.error(`[Next.js ERR] ${line}`);
        });
      });

      await waitForServer(port);
      console.log(`✅ Next.js dev server is running on port ${port}!`);
    }

    console.log(`\n🖥️  Starting Electron application...`);
    const electronProcess = spawn('npx', ['electron', 'desktop/main.js'], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, ELECTRON_DEV_PORT: port.toString() }
    });

    electronProcess.on('close', (code) => {
      console.log(`Electron app closed with code ${code}.`);
      if (nextProcess) {
        console.log('Shutting down Next.js dev server...');
        nextProcess.kill('SIGTERM');
      }
      process.exit(0);
    });

    const cleanup = () => {
      if (nextProcess) nextProcess.kill('SIGTERM');
      if (electronProcess) electronProcess.kill('SIGTERM');
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

  } catch (err) {
    console.error('Error starting development environment:', err);
    process.exit(1);
  }
})();
