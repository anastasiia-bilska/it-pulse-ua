// Public API of shared/analytics: visitor analytics on Umami Cloud (ADR 0019). Umami is
// cookieless, so the page needs no consent banner. Clicks are counted by Umami itself on any
// <button>/<a> with a data-umami-event attribute; block views are counted here, for every element
// with a data-block attribute.
import { UMAMI_WEBSITE_ID } from '../config/index.ts';

// ---- types -------------------------------------------------------------------------------------

type TrackEvent = (name: string, data: Record<string, string>) => void;

declare global {
  // Set by Umami's script once it loads.
  var umami: { track: TrackEvent } | undefined;
}

// ---- constants ---------------------------------------------------------------------------------

const SCRIPT_URL = 'https://cloud.umami.is/script.js';
/** Only the live site reports: dev, previews and e2e runs would skew the numbers. */
const PRODUCTION_HOST = 'it-pulse-ua.pages.dev';
export const BLOCK_VIEW_EVENT = 'block-view';
/**
 * A block counts as seen once it crosses the middle fifth of the screen. A share-of-block
 * threshold would never fire for a block taller than the screen.
 */
const SCREEN_MIDDLE_BAND = '-40% 0px -40% 0px';

// ---- functions ---------------------------------------------------------------------------------

export function startAnalytics(): void {
  if (location.hostname !== PRODUCTION_HOST) {
    return;
  }
  const script = document.createElement('script');
  script.src = SCRIPT_URL;
  script.defer = true;
  script.dataset.websiteId = UMAMI_WEBSITE_ID;
  // Order matters: globalThis.umami exists only after the load, and a block seen earlier (the hero
  // is seen at once) would be lost.
  script.addEventListener('load', () => {
    observeBlockViews(document.body, (name, data) => globalThis.umami?.track(name, data));
  });
  document.head.append(script);
}

/**
 * Reports each data-block once per page load. Data blocks mount after aggregates.json arrives, so
 * new elements are picked up as they appear.
 */
export function observeBlockViews(root: HTMLElement, track: TrackEvent): void {
  const seen = new Set<string>();
  const visibility = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const block = entry.isIntersecting ? blockName(entry.target) : undefined;
        if (block === undefined || seen.has(block)) {
          continue;
        }
        seen.add(block);
        visibility.unobserve(entry.target);
        track(BLOCK_VIEW_EVENT, { block });
      }
    },
    { rootMargin: SCREEN_MIDDLE_BAND },
  );
  function observeBlocks(): void {
    for (const element of root.querySelectorAll('[data-block]')) {
      visibility.observe(element);
    }
  }
  observeBlocks();
  new MutationObserver(observeBlocks).observe(root, { childList: true, subtree: true });
}

function blockName(element: Element): string | undefined {
  return element instanceof HTMLElement ? element.dataset.block : undefined;
}
