import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Vite configuration for Chrome Extension (Manifest V3)
 */
export default defineConfig({
  plugins: [react()],

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
