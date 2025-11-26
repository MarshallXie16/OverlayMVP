import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const renamePopupHtml = (): Plugin => ({
  name: 'rename-popup-html',
  apply: 'build',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const originalFileName = 'src/popup/index.html';
    const popupHtml = bundle[originalFileName];

    if (popupHtml && popupHtml.type === 'asset') {
      delete bundle[originalFileName];
      bundle['popup/index.html'] = {
        ...popupHtml,
        fileName: 'popup/index.html',
        name: 'popup/index.html',
      };
    }
  },
});

/**
 * Vite configuration for Chrome Extension (Manifest V3)
 */
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'src/manifest.json',
          dest: '.',
        },
        {
          src: 'public/icons/*',
          dest: 'icons',
        },
        {
          src: 'src/content/styles/*.css',
          dest: 'content/styles',
        },
      ],
    }),
    renamePopupHtml(),
  ],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === 'development',

    rollupOptions: {
      input: {
        // Popup UI (React app)
        popup: resolve(__dirname, 'src/popup/index.html'),

        // Background service worker (ES module)
        background: resolve(__dirname, 'src/background/index.ts'),

        // Content scripts
        'content-recorder': resolve(__dirname, 'src/content/recorder.ts'),
        'content-walkthrough': resolve(__dirname, 'src/content/walkthrough.ts'),
      },

      output: {
        entryFileNames: (chunkInfo) => {
          // Background worker as ES module
          if (chunkInfo.name === 'background') {
            return 'background/index.js';
          }
          // Content scripts
          if (chunkInfo.name.startsWith('content-')) {
            const name = chunkInfo.name.replace('content-', '');
            return `content/${name}.js`;
          }
          // Default for other entries
          return '[name]/[name].js';
        },

        // Disable vendor/shared chunking for content scripts to ensure single-file outputs
        manualChunks: undefined,
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        format: 'es', // Use ES modules for all
      },
    },

    // Optimize for production
    minify: process.env.NODE_ENV === 'production',
    target: 'es2020',
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  // Define globals
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
});
