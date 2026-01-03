#!/usr/bin/env node
/**
 * Build content scripts with esbuild
 *
 * Content scripts in Chrome extensions cannot use ES modules.
 * They must be self-contained IIFE bundles.
 * This script uses esbuild to bundle them properly.
 */

import * as esbuild from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, "../src");
const distDir = resolve(__dirname, "../dist");

const contentScripts = [
  { entry: "content/recorder.ts", output: "content/recorder.js" },
  { entry: "content/walkthrough.ts", output: "content/walkthrough.js" },
];

async function buildContentScripts() {
  console.log("Building content scripts with esbuild...");

  for (const script of contentScripts) {
    try {
      await esbuild.build({
        entryPoints: [resolve(srcDir, script.entry)],
        bundle: true,
        format: "iife", // Self-contained, no imports
        outfile: resolve(distDir, script.output),
        target: "es2020",
        minify: process.env.NODE_ENV === "production",
        sourcemap: process.env.NODE_ENV === "development",
        // Don't split into chunks
        splitting: false,
        // Resolve @ alias
        alias: {
          "@": srcDir,
        },
        // Define process.env
        define: {
          "process.env.NODE_ENV": JSON.stringify(
            process.env.NODE_ENV || "production",
          ),
        },
      });
      console.log(`  ✓ ${script.output}`);
    } catch (error) {
      console.error(`  ✗ ${script.output}:`, error.message);
      process.exit(1);
    }
  }

  console.log("Content scripts built successfully!");
}

buildContentScripts();
