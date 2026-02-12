import { defineConfig } from 'vite';
import rollupNodePolyFill from 'rollup-plugin-polyfill-node';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import { NodeModulesPolyfillPlugin } from '@esbuild-plugins/node-modules-polyfill';

export default defineConfig({
  resolve: {
    alias: {
      util: 'rollup-plugin-node-polyfills/polyfills/util',
      stream: 'rollup-plugin-node-polyfills/polyfills/stream',
      path: 'rollup-plugin-node-polyfills/polyfills/path',
      url: 'rollup-plugin-node-polyfills/polyfills/url',
      buffer: 'rollup-plugin-node-polyfills/polyfills/buffer',
      process: 'rollup-plugin-node-polyfills/polyfills/process-es6',
      http: 'rollup-plugin-node-polyfills/polyfills/http',
      https: 'rollup-plugin-node-polyfills/polyfills/http',
      zlib: 'rollup-plugin-node-polyfills/polyfills/zlib',
      os: 'rollup-plugin-node-polyfills/polyfills/os',
    },
  },
  server: {
    proxy: {
      '/das-api': {
        target: 'https://das-api.metaplex.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/das-api/, ''),
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
      plugins: [
        NodeGlobalsPolyfillPlugin({ buffer: true, process: true }),
        NodeModulesPolyfillPlugin(),
      ],
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      plugins: [rollupNodePolyFill()],
    },
  },
});
