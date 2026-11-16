# 0022. rem for every size, hairlines included

- Status: accepted
- Date: 2026-11-16

## Context

ADR 0014 compiled sizes to rem through `rem()` but kept hairlines under 4px (borders, focus rings,
small gaps and radii) in raw px, so they would not grow with the reader's font size. In practice
the exception blurred the rule: about 60 raw px values had spread across the stylesheets, and new
code kept mixing the two without a clear line between "hairline" and "size".

## Decision

- **Every length in a stylesheet goes through `rem()`**, hairlines included. Custom properties use
  interpolation: `#{rem(1px)}`.
- The only px left are in comments and in `_units.scss` itself. Media queries stay in em
  (`_breakpoints.scss`).
- A unit test (`web/src/shared/styles/tests/units.test.ts`) fails on any raw px in a `.scss` file,
  so the rule holds without relying on review.

## Consequences

- At a larger browser font size, borders and focus rings grow with the rest of the page, so the
  proportions stay as designed. Browsers snap border widths to whole device pixels, so a 1px line
  at 16px root stays a crisp 1px.
- One rule, one helper: no judgement call over what counts as a hairline.
