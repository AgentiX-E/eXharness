/** Normalize answer text for comparison: lowercase and collapse whitespace. */
export function normalizeAnswer(
  text: string,
  options: { lowercase?: boolean; collapseWhitespace?: boolean } = {},
): string {
  let result = text
  if (options.collapseWhitespace !== false) result = result.replace(/\s+/g, ' ').trim()
  if (options.lowercase !== false) result = result.toLowerCase()
  return result
}

/** Exact-match accuracy between a predicted answer and an expected answer. */
export function exactMatch(predicted: string, expected: string, options: { normalize?: boolean } = {}): boolean {
  if (options.normalize === false) return predicted === expected
  return normalizeAnswer(predicted) === normalizeAnswer(expected)
}

/** Classification accuracy: fraction of predictions equal to the labels. */
export function accuracy(predicted: readonly unknown[], expected: readonly unknown[]): number {
  if (predicted.length !== expected.length) throw new Error('accuracy: arrays must have equal length')
  if (predicted.length === 0) return 0
  let correct = 0
  for (let i = 0; i < predicted.length; i++) if (predicted[i] === expected[i]) correct++
  return correct / predicted.length
}

export function precision(truePositives: number, falsePositives: number): number {
  const denom = truePositives + falsePositives
  return denom === 0 ? 0 : truePositives / denom
}

export function recall(truePositives: number, falseNegatives: number): number {
  const denom = truePositives + falseNegatives
  return denom === 0 ? 0 : truePositives / denom
}

/** F-beta score; beta=1 is the standard F1 (harmonic mean). */
export function fBeta(beta: number, truePositives: number, falsePositives: number, falseNegatives: number): number {
  const p = precision(truePositives, falsePositives)
  const r = recall(truePositives, falseNegatives)
  const b2 = beta * beta
  const denom = b2 * p + r
  return denom === 0 ? 0 : ((1 + b2) * p * r) / denom
}

export function f1Score(truePositives: number, falsePositives: number, falseNegatives: number): number {
  return fBeta(1, truePositives, falsePositives, falseNegatives)
}

/** Simple binary confusion-matrix counters derived from two boolean arrays. */
export function confusionMatrix(
  predicted: readonly boolean[],
  expected: readonly boolean[],
): {
  truePositives: number
  falsePositives: number
  falseNegatives: number
  trueNegatives: number
} {
  if (predicted.length !== expected.length) throw new Error('confusionMatrix: arrays must have equal length')
  let tp = 0
  let fp = 0
  let fn = 0
  let tn = 0
  for (let i = 0; i < predicted.length; i++) {
    const p = predicted[i]!
    const e = expected[i]!
    if (p && e) tp++
    else if (p && !e) fp++
    else if (!p && e) fn++
    else tn++
  }
  return { truePositives: tp, falsePositives: fp, falseNegatives: fn, trueNegatives: tn }
}

/** Per-sample 0/1 correctness from predicted vs expected, as a number array. */
export function correctnessArray(predicted: readonly unknown[], expected: readonly unknown[]): number[] {
  if (predicted.length !== expected.length) throw new Error('correctnessArray: arrays must have equal length')
  return predicted.map((p, i) => (p === expected[i] ? 1 : 0))
}
