// Copy names the data sources as plain words ("DOU", "Djinni"); this turns each into a link, so the
// translations stay plain strings.
import type { ReactElement } from 'react';
import { SOURCE_URLS } from '../config/index.ts';

// ---- constants ---------------------------------------------------------------------------------

const SOURCE_NAME = /(DOU|Djinni)/;

// ---- functions ---------------------------------------------------------------------------------

export function WithSourceLinks({ text }: { text: string }): ReactElement {
  return (
    <>
      {text.split(SOURCE_NAME).map((part, index) =>
        isSource(part) ? (
          <a
            key={index}
            href={SOURCE_URLS[part]}
            target="_blank"
            rel="noopener noreferrer"
            data-umami-event="outbound-source"
            data-umami-event-source={part}
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

function isSource(part: string): part is keyof typeof SOURCE_URLS {
  return Object.hasOwn(SOURCE_URLS, part);
}
