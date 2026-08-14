const path = require('path');
const { pushSync, pullSync } = require(path.join(__dirname, '..', 'src', 'lib', 'sync', 'sync-service.ts'));

// Need to run via ts-node to execute TS files, or we can just compile it, but let's use a Next.js route if possible.
