import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    target: 'node18',
    outDir: 'dist/main',
    lib: {
      entry: path.resolve(__dirname, 'src/main/index.ts'),
      formats: ['cjs'],
      fileName: () => '[name].js',
    },
    minify: false,
    rollupOptions: {
      external: [
        'electron',
        'path',
        'os',
        'fs',
        'child_process',
        'events',
        'util',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
