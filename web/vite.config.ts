/// <reference types="vitest/config" />
// Build for the public dashboard (ADR 0014): `npm run build:web` writes dist/site, then
// `npm run dashboard` adds aggregates.json next to it. Component tests run in Vitest here too.
import react from '@vitejs/plugin-react';
import { FontaineTransform } from 'fontaine';
import { fileURLToPath } from 'node:url';
import { defineConfig, type HtmlTagDescriptor, type Plugin } from 'vite';

// ---- constants ---------------------------------------------------------------------------------

const NODE_MODULES = new URL('../node_modules/', import.meta.url);

/**
 * Fonts the first screen paints with: the hero heading (Unbounded) and body text (Inter), in the
 * page's default language. Mono and latin load lazily; preloading them would delay these two.
 */
const ABOVE_THE_FOLD_FONTS = [
  /unbounded-cyrillic-wght-normal-[\w-]+\.woff2$/,
  /inter-cyrillic-wght-normal-[\w-]+\.woff2$/,
];

// ---- functions ---------------------------------------------------------------------------------

/** Adds <link rel=preload> for the hashed above-the-fold font files of the production build. */
function preloadFonts(patterns: RegExp[]): Plugin {
  return {
    name: 'preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, context): HtmlTagDescriptor[] {
        const files = Object.keys(context.bundle ?? {});
        return files
          .filter((file) => patterns.some((pattern) => pattern.test(file)))
          .map((file) => ({
            tag: 'link',
            attrs: {
              rel: 'preload',
              href: `./${file}`,
              as: 'font',
              type: 'font/woff2',
              crossorigin: '',
            },
            // Before the stylesheet, so the fetch starts before CSS is parsed.
            injectTo: 'head-prepend',
          }));
      },
    },
  };
}

/** fontaine reads each font's metrics from its file to size the local fallback face. */
function resolveFontFile(id: string): URL {
  return new URL(id.replace(/^\//, ''), NODE_MODULES);
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // GitHub Pages serves the site under /it-pulse-ua/, so every asset URL stays relative.
  base: './',
  // Copied as is into dist/site: only _headers, the Cloudflare Pages cache rules (ADR 0015).
  publicDir: 'public',
  plugins: [
    react(),
    FontaineTransform.vite({
      fallbacks: { Unbounded: ['Arial'], Inter: ['Arial'], 'JetBrains Mono': ['Courier New'] },
      resolvePath: resolveFontFile,
    }),
    preloadFonts(ABOVE_THE_FOLD_FONTS),
  ],
  build: {
    outDir: '../dist/site',
    emptyOutDir: true,
    // Fonts are separate files so unicode-range can skip the subsets a page never uses.
    assetsInlineLimit: 0,
  },
  test: {
    // Component tests (*.test.tsx). Pure rules (*.test.ts) run under node --test like the backend.
    include: ['src/**/tests/*.test.tsx'],
    // happy-dom implements <dialog> showModal(), which the burger menu relies on.
    environment: 'happy-dom',
    setupFiles: ['src/shared/testing/setup.ts'],
  },
});
