import {defineConfig} from 'vitest/config';
import path from 'node:path';
export default defineConfig({
 test:{include:['tests/financial-followthrough/*.test.ts'],globals:true,environment:'node',testTimeout:10000},
 resolve:{alias:{'@':path.resolve(import.meta.dirname,'../../src')}},
});
