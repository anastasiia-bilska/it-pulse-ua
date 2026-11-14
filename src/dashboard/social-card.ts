// The social card (og:image, 1200×630): the canvas design "Share" filled with this build's numbers.
// Pure: aggregates in, HTML out. render-social-card.ts turns the HTML into a PNG.
// Aggregates only (ADR 0011): totals, a share and a skill name, nothing from a vacancy.
import type { Aggregates } from './aggregates.ts';

// ---- types -------------------------------------------------------------------------------------

export interface SocialCardFacts {
  vacancies: string;
  remoteShare: string;
  topSkill: string;
}

// ---- constants ---------------------------------------------------------------------------------

const SITE_HOST = 'it-pulse-ua.pages.dev';
const ACCENT = '#D4F53C';
const NUMBER_FORMAT = new Intl.NumberFormat('uk-UA');
const PERCENT_FORMAT = new Intl.NumberFormat('uk-UA', { style: 'percent' });
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

// ---- functions ---------------------------------------------------------------------------------

/** Null when there is nothing to show yet: the card then goes out without the numbers row. */
export function socialCardFacts(aggregates: Aggregates): SocialCardFacts | null {
  const topSkill = aggregates.topSkills[0];
  if (!topSkill || aggregates.totals.extracted === 0) {
    return null;
  }
  const remote = aggregates.distributions.work_format.find((share) => share.value === 'remote');
  return {
    vacancies: NUMBER_FORMAT.format(aggregates.totals.vacancies),
    remoteShare: PERCENT_FORMAT.format(remote?.share ?? 0),
    topSkill: topSkill.value,
  };
}

/** `fontFaces` is the @font-face CSS; the card itself never loads anything from the network. */
export function socialCardHtml(facts: SocialCardFacts | null, fontFaces: string): string {
  return `<!doctype html>
<html lang="uk"><head><meta charset="utf-8"><style>
${fontFaces}
body { margin: 0; }
.card { width: 1200px; height: 630px; box-sizing: border-box; padding: 64px 72px;
  background: #0C0E12; color: #EEF0F4; font-family: 'Inter Variable', sans-serif;
  display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
.row { display: flex; align-items: center; justify-content: space-between; }
.brand { display: flex; align-items: center; gap: 14px; }
.logo { width: 52px; height: 52px; border-radius: 14px; background: ${ACCENT};
  display: flex; align-items: center; justify-content: center; }
.display { font-family: 'Unbounded Variable', sans-serif; font-weight: 700; }
.host { font-family: 'JetBrains Mono Variable', monospace; font-weight: 500; font-size: 18px; color: #A0A7B4; }
h1 { margin: 0 0 18px; font-size: 68px; line-height: 1.02; letter-spacing: -0.03em; max-width: 15ch; }
p { margin: 0; font-size: 24px; color: #C7CCD6; }
.stats { display: flex; align-items: flex-end; gap: 48px; }
.stat { display: flex; flex-direction: column; }
.value { font-size: 44px; }
.label { font-size: 17px; color: #A0A7B4; }
</style></head><body><div class="card">
<div class="row">
  <div class="brand">
    <span class="logo"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0C0E12" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 12 7 12 9.5 5 14 19 16.5 12 22 12"/></svg></span>
    <span class="display" style="font-size: 28px">IT Pulse UA</span>
  </div>
  <span class="host">${SITE_HOST}</span>
</div>
<div>
  <h1 class="display">Пульс IT-ринку України в цифрах</h1>
  <p>Ролі, навички, формат роботи й зарплати з DOU та Djinni — оновлюється кожні 2 години.</p>
</div>
${facts ? statsRow(facts) : '<div></div>'}
</div></body></html>`;
}

function statsRow(facts: SocialCardFacts): string {
  return `<div class="stats">
  ${stat(facts.vacancies, 'вакансій за 30 днів', ACCENT)}
  ${stat(facts.remoteShare, 'віддалено')}
  ${stat(facts.topSkill, 'навичка №1')}
  <svg viewBox="0 0 300 80" style="flex: 1; height: 80px"><polyline points="0,50 90,50 110,22 130,72 150,10 172,60 190,50 300,50" fill="none" stroke="${ACCENT}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/></svg>
</div>`;
}

function stat(value: string, label: string, color = 'inherit'): string {
  return `<div class="stat"><span class="display value" style="color: ${color}">${escapeHtml(value)}</span><span class="label">${label}</span></div>`;
}

function escapeHtml(text: string): string {
  return text.replaceAll(/[&<>"]/g, (character) => HTML_ESCAPES[character] ?? character);
}
