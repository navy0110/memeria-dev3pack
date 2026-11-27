import { build } from 'vite';
import { copyFile, mkdir } from 'node:fs/promises';

await build({
  build: {
    ssr: 'src/server/rugwyrm-arena.ts',
    outDir: 'dist/arena',
    emptyOutDir: true,
  },
});

await build({
  build: {
    ssr: 'src/server/rugwyrm-worker.ts',
    rollupOptions: { external: ['cloudflare:workers'], output: { entryFileNames: 'worker.js' } },
    outDir: 'dist/arena-worker',
    emptyOutDir: true,
  },
});

await build({
  build: {
    lib: {
      entry: 'src/client/rugwyrm-spectator.ts',
      formats: ['es'],
      fileName: () => 'spectator.js',
    },
    outDir: 'dist/arena',
    emptyOutDir: false,
  },
});

const assets = 'dist/arena-worker-assets';
await mkdir(assets, { recursive: true });
await copyFile('../rugwyrm.html', assets + '/index.html');
await copyFile('dist/arena/spectator.js', assets + '/rugwyrm-spectator.js');
