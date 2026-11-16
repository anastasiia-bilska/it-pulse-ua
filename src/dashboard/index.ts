// Public API of the dashboard module. Other modules import only from here.
export { DIMENSIONS } from './aggregates.ts';
export type { Aggregates, DigestEpisode, Dimension } from './aggregates.ts';
export { judgeFreshness, MIN_N, salaryRow, toShares, WINDOW_DAYS } from './statistics.ts';
export type { PipelineStatus } from './statistics.ts';
export type { Count, Freshness, SalaryRow, Share, StaleReason } from './statistics.ts';
