import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { viteStaticCopy } from "vite-plugin-static-copy";

const renamePopupHtml = (): Plugin => ({
  name: "rename-popup-html",
  apply: "build",
  enforce: "post",
  generateBundle(_options, bundle) {
    const originalFileName = "src/popup/index.html";
    const popupHtml = bundle[originalFileName];

    if (popupHtml && popupHtml.type === "asset") {
      delete bundle[originalFileName];
      bundle["popup/index.html"] = {
        ...popupHtml,
        fileName: "popup/index.html",
        name: "popup/index.html",
      };
    }
  },
});

/**
 * Vite configuration for Chrome Extension (Manifest V3)
 *
 * IMPORTANT: Content scripts require special handling because they:
 * 1. Cannot use ES module imports (no import/export at runtime)
 * 2. Must be self-contained single files
 * 3. Are injected into web pages as regular scripts
 *
 * We use multiple outputs to handle this:
 * - ES modules for popup (loaded via HTML) and background (MV3 supports modules)
 * - IIFE for content scripts (self-contained, no imports)
 */
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: "src/manifest.json",
          dest: ".",
        },
        {
          src: "public/icons/*",
          dest: "icons",
        },
        {
          src: "src/content/styles/*.css",
          dest: "content/styles",
        },
      ],
    }),
    renamePopupHtml(),
  ],

  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === "development",

    rollupOptions: {
      input: {
        // Popup UI (React app) - loaded via HTML, ES modules work
        popup: resolve(__dirname, "src/popup/index.html"),

        // Background service worker - MV3 supports ES modules with type: "module"
        background: resolve(__dirname, "src/background/index.ts"),

        // Content scripts - MUST be self-contained (no ES module imports)
        "content-recorder": resolve(__dirname, "src/content/recorder.ts"),
        "content-walkthrough": resolve(__dirname, "src/content/walkthrough.ts"),
      },

      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") {
            return "background/index.js";
          }
          if (chunkInfo.name.startsWith("content-")) {
            const name = chunkInfo.name.replace("content-", "");
            return `content/${name}.js`;
          }
          return "[name]/[name].js";
        },

        // Disable code splitting entirely - each entry gets all its dependencies inlined
        // This is critical for content scripts which cannot import external chunks
        manualChunks: () => undefined,

        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",

        // Use ES modules format
        // Content scripts will still work because manualChunks forces all code inline
        format: "es",
      },
    },

    // Optimize for production
    minify: process.env.NODE_ENV === "production",
    target: "es2020",
  },

  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },

  // Define globals
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "production",
    ),
  },
});
