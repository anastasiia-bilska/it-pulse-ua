// The page's sections, shared by the desktop nav and the mobile menu so they never drift apart.
import type { Messages } from '../../shared/i18n/index.ts';

// ---- types -------------------------------------------------------------------------------------

export type SectionId = keyof Messages['menuHints'];

// ---- constants ---------------------------------------------------------------------------------

export const SECTIONS: readonly SectionId[] = ['market', 'skills', 'salary', 'method'];
