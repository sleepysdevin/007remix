import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-bake',
    rollupOptions: {
      input: 'scripts/bake.html',
    },
  },
});
