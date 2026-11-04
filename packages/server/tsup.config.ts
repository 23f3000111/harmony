import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // The shared package is plain TypeScript, so it goes inside the bundle. Everything else stays in node_modules.
  noExternal: ['@harmony/shared'],
});
