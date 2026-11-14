// One source of truth for aggregates.json: the type the dashboard CLI writes (type-only import,
// erased at build time, so no backend code reaches the bundle).
export type {
  Aggregates,
  Count,
  DigestEpisode,
  Dimension,
  Freshness,
  SalaryRow,
  Share,
  StaleReason,
} from '../../../../src/dashboard/index.ts';
