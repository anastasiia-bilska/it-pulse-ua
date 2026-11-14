// CLI: renders the social cards (og:image) to dist/site/og-<language>.png from this build's
// aggregates.json, one per page language (ADR 0019).
// Run after `npm run dashboard`. Chromium paints it with the same self-hosted fonts as the site,
// inlined, so the render needs no network.
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import type { Aggregates } from './aggregates.ts';
import { CARD_LANGUAGES, socialCardFacts, socialCardHtml } from './social-card.ts';

// ---- constants ---------------------------------------------------------------------------------

const SITE_DIRECTORY = new URL('../../dist/site/', import.meta.url);
const NODE_MODULES = new URL('../../node_modules/@fontsource-variable/', import.meta.url);
const FONT_PACKAGES = ['unbounded', 'inter', 'jetbrains-mono'];
/** The cards are English and Ukrainian: no other subset is needed. */
const NEEDED_SUBSET = /-(latin|cyrillic)-wght-normal\.woff2/;
const CARD_SIZE = { width: 1200, height: 630 };

// ---- functions ---------------------------------------------------------------------------------

async function renderSocialCard(): Promise<void> {
  const aggregates = JSON.parse(
    await readFile(new URL('aggregates.json', SITE_DIRECTORY), 'utf8'),
  ) as Aggregates;
  const facts = socialCardFacts(aggregates);
  const fontFaces = await inlineFontFaces();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: CARD_SIZE });
    for (const language of CARD_LANGUAGES) {
      await page.setContent(socialCardHtml(facts, language, fontFaces));
      await page.evaluate(async () => {
        await globalThis.document.fonts.ready;
      });
      await writeFile(new URL(`og-${language}.png`, SITE_DIRECTORY), await page.screenshot());
    }
  } finally {
    await browser.close();
  }
  console.log(`social card: ${facts ? 'with numbers' : 'without numbers'}`);
}

/** fontsource's own @font-face rules (with their unicode-range), each file as a data URI. */
async function inlineFontFaces(): Promise<string> {
  const css = await Promise.all(FONT_PACKAGES.map((name) => inlinePackageFaces(name)));
  return css.join('\n');
}

async function inlinePackageFaces(name: string): Promise<string> {
  const directory = new URL(`${name}/`, NODE_MODULES);
  const css = await readFile(new URL('wght.css', directory), 'utf8');
  const rules = css.split('@font-face').filter((rule) => NEEDED_SUBSET.test(rule));
  const inlined = await Promise.all(
    rules.map(async (rule) => {
      const file = /url\(\.\/(files\/[^)]+)\)/.exec(rule)?.[1];
      if (!file) {
        return '';
      }
      const font = await readFile(new URL(file, directory));
      const dataUri = `url(data:font/woff2;base64,${font.toString('base64')})`;
      return `@font-face${rule.replace(/url\([^)]+\)/, () => dataUri)}`;
    }),
  );
  return inlined.join('\n');
}

// ---- entry point -------------------------------------------------------------------------------

await renderSocialCard();
