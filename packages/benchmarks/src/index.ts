export type { Benchmark, BenchmarkResult, BenchmarkSample, Dataset, Generate, ScoreResult, Scorer } from './types.js'

export {
  extractChoiceLetter,
  MultipleChoiceScorer,
  type MultipleChoiceScorerOptions,
} from './scorers/multiple-choice.js'
export { extractNumber, numbersEqual, NumericMatchScorer, type NumericMatchScorerOptions } from './scorers/numeric.js'
export { passAtK, passAtKFromOutputs } from './scorers/pass-k.js'
export {
  checkInstruction,
  checkInstructions,
  instructionCheckers,
  InstructionFollowingScorer,
  type InstructionCheck,
  type InstructionChecker,
  type InstructionFollowingScorerOptions,
} from './scorers/instruction-following.js'

export {
  parseJsonl,
  multipleChoiceBenchmark,
  ifevalBenchmark,
  gsm8kBenchmark,
  type MmluEntry,
  type IfEvalEntry,
  type Gsm8kEntry,
} from './datasets.js'

export { aggregate, BenchmarkRunner, type RunnerOptions } from './runner.js'
