// Public API of the evaluation module. Other modules import only from here.
export {
  BLIND_SIZE,
  DATASET_NAME,
  SAMPLE_SIZE,
  sampleEvalSet,
  type Candidate,
  type SampledVacancy,
} from './sample.ts';
export {
  SCORED_FIELDS,
  scoreEval,
  type EvalScore,
  type ExpectedFields,
  type GroupScore,
  type ScoredCase,
} from './score.ts';
