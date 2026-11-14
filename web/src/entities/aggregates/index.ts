// Public API of the aggregates entity: the data the dashboard shows and the rules for drawing it.
export { valueLabel } from './labels.ts';
export { loadAggregates } from './load-aggregates.ts';
export type {
  Aggregates,
  DigestEpisode,
  Freshness,
  SalaryRow,
  Share,
  StaleReason,
} from './types.ts';
export {
  barRows,
  insights,
  kpis,
  NOT_STATED,
  PROFILE_DIMENSIONS,
  profileSegments,
  salaryGeometry,
  salaryScale,
  seniorityRows,
} from './view-model.ts';
export type {
  BarRow,
  BarTone,
  Insight,
  Kpis,
  ProfileDimension,
  ProfileSegment,
  SalaryGeometry,
} from './view-model.ts';
