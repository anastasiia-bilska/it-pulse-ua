// The agent's numbers as dashboard bars: a distribution shows shares, top skills show counts, as on
// the dashboard. "Not stated" is hatched, never the leader.
import { NOT_STATED, valueLabel } from '../../entities/aggregates/index.ts';
import { formatNumber, formatShare, fractionOf, type Language } from '../../shared/lib/index.ts';
import type { BarFill, BarItem } from '../../shared/ui/index.ts';
import type { ReplyChart } from './ask-request.ts';

// ---- types -------------------------------------------------------------------------------------

type Bar = ReplyChart['bars'][number];

// ---- constants ---------------------------------------------------------------------------------

/** The server sends percents (0–100); the formatter takes a share (0–1). */
const PERCENT = 100;

// ---- functions ---------------------------------------------------------------------------------

export function replyBars(chart: ReplyChart, language: Language): BarItem[] {
  const longest = Math.max(...chart.bars.map((bar) => bar.n));
  const leader = chart.bars.find((bar) => bar.value !== NOT_STATED);
  return chart.bars.map((bar) => ({
    key: bar.value,
    label: chart.dimension ? valueLabel(chart.dimension, bar.value, language) : bar.value,
    value: chart.dimension
      ? formatShare(bar.percent / PERCENT, language)
      : formatNumber(bar.n, language),
    fraction: fractionOf(bar.n, longest),
    fill: fillOf(bar, leader),
  }));
}

function fillOf(bar: Bar, leader: Bar | undefined): BarFill {
  if (bar.value === NOT_STATED) {
    return 'missing';
  }
  return bar === leader ? 'leader' : 'neutral';
}
