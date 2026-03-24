import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    target: 'node18',
    outDir: 'dist/preload',
    lib: {
      entry: path.resolve(__dirname, 'src/preload/index.ts'),
      formats: ['cjs'],
      fileName: () => '[name].js',
    },
    minify: false,
    rollupOptions: {
      external: ['electron'],
    },
  },
});
