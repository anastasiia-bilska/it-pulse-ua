import { render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { BLOCK_VIEW_EVENT, observeBlockViews } from '../index.ts';

// ---- types -------------------------------------------------------------------------------------

type VisibilityCallback = (entries: { target: Element; isIntersecting: boolean }[]) => void;

// ---- module state ------------------------------------------------------------------------------

let reportVisibility: VisibilityCallback;

// ---- functions ---------------------------------------------------------------------------------

/** happy-dom never scrolls, so the test decides what is on screen. */
function fakeIntersectionObserver(): void {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      constructor(callback: VisibilityCallback) {
        reportVisibility = callback;
      }
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('each block is reported once, when it comes on screen', () => {
  fakeIntersectionObserver();
  const track = vi.fn();
  const { container } = render(
    <main>
      <section data-block="hero" />
      <section data-block="skills" />
    </main>,
  );
  const [hero, skills] = container.querySelectorAll('section');
  observeBlockViews(container, track);

  reportVisibility([{ target: skills!, isIntersecting: false }]);
  reportVisibility([{ target: hero!, isIntersecting: true }]);
  reportVisibility([{ target: hero!, isIntersecting: true }]);

  expect(track).toHaveBeenCalledOnce();
  expect(track).toHaveBeenCalledWith(BLOCK_VIEW_EVENT, { block: 'hero' });
});
