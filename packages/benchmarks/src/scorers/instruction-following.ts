import type { BenchmarkSample, ScoreResult, Scorer } from '../types.js'

/**
 * IFEval — verifiable instruction-following checks (Zhou et al., "Instruction-
 * Following Evaluation for Large Language Models", arXiv:2311.07911).
 *
 * This module implements the deterministic, regex/structural checks for the
 * benchmark's 25 verifiable instruction types. Language-detection-dependent
 * checks (`language:response_language`, `change_case:english_capital/lowercase`)
 * and the semantic `rephrase` check are intentionally out of scope for a
 * zero-dependency, browser-safe implementation; they are documented in the
 * benchmark adapter and can be layered on later.
 */

export interface InstructionCheck {
  id: string
  kwargs: Record<string, unknown>
}

export type InstructionChecker = (response: string, kwargs: Record<string, unknown>) => boolean

function asString(v: unknown, name: string): string {
  if (typeof v !== 'string' || v.length === 0) throw new Error(`IFEval: ${name} must be a non-empty string`)
  return v
}

function asStringArray(v: unknown, name: string): string[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`IFEval: ${name} must be a non-empty array`)
  return v.map((x) => asString(x, name))
}

function asNumber(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`IFEval: ${name} must be a finite number`)
  return v
}

function relation(kwargs: Record<string, unknown>): 'less than' | 'at least' | 'equal' {
  return relationFrom('relation', kwargs)
}

function relationFrom(key: string, kwargs: Record<string, unknown>): 'less than' | 'at least' | 'equal' {
  const r = asString(kwargs[key], key)
  if (r === 'less than' || r === 'at least' || r === 'equal') return r
  throw new Error(`IFEval: unsupported relation "${r}"`)
}

function compare(actual: number, relationValue: 'less than' | 'at least' | 'equal', threshold: number): boolean {
  if (relationValue === 'less than') return actual < threshold
  if (relationValue === 'at least') return actual >= threshold
  return actual === threshold
}

function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length
}

function countSentences(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length
}

function wordTokens(text: string): string[] {
  return text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) ?? []
}

/** All keywords present (case-insensitive). */
const keywordsExistence: InstructionChecker = (response, kwargs) => {
  const keywords = asStringArray(kwargs.keywords, 'keywords')
  const lower = response.toLowerCase()
  return keywords.every((k) => lower.includes(k.toLowerCase()))
}

/** No forbidden word may appear as a whole word (case-insensitive). */
const keywordsForbidden: InstructionChecker = (response, kwargs) => {
  const words = asStringArray(kwargs.forbidden_words, 'forbidden_words')
  const lower = response.toLowerCase()
  return words.every((w) => !new RegExp(`\\b${escapeRegExp(w.toLowerCase())}\\b`).test(lower))
}

/** Keyword occurrence count vs. a threshold. */
const keywordsFrequency: InstructionChecker = (response, kwargs) => {
  const keyword = asString(kwargs.keyword, 'keyword')
  const frequency = asNumber(kwargs.frequency, 'frequency')
  const rel = relation(kwargs)
  const matches = response.toLowerCase().match(new RegExp(escapeRegExp(keyword.toLowerCase()), 'g'))
  return compare(matches?.length ?? 0, rel, frequency)
}

/** Occurrence count of a single letter. */
const keywordsLetterFrequency: InstructionChecker = (response, kwargs) => {
  const letter = asString(kwargs.letter, 'letter').toLowerCase()
  const frequency = asNumber(kwargs.let_frequency, 'let_frequency')
  const rel = relationFrom('let_relation', kwargs)
  const count = [...response.toLowerCase()].filter((c) => c === letter).length
  return compare(count, rel, frequency)
}

/** Word-count constraint. */
const lengthNumberWords: InstructionChecker = (response, kwargs) => {
  const numWords = asNumber(kwargs.num_words, 'num_words')
  const rel = relation(kwargs)
  return compare(countWords(response), rel, numWords)
}

/** Sentence-count constraint. */
const lengthNumberSentences: InstructionChecker = (response, kwargs) => {
  const numSentences = asNumber(kwargs.num_sentences, 'num_sentences')
  const rel = relation(kwargs)
  return compare(countSentences(response), rel, numSentences)
}

/** Bracket placeholders `[...]` count must be at least N. */
const placeholders: InstructionChecker = (response, kwargs) => {
  const num = asNumber(kwargs.num_placeholders, 'num_placeholders')
  const count = response.match(/\[.*?\]/g)?.length ?? 0
  return count >= num
}

/** Markdown bullet list (`*` or `-`) line count must be exact. */
const bulletLists: InstructionChecker = (response, kwargs) => {
  const numBullets = asNumber(kwargs.num_bullets, 'num_bullets')
  const count = response.split(/\r?\n/).filter((line) => /^\s*(\*|-)\s+/.test(line)).length
  return count === numBullets
}

/** Highlighted `*text*` / `**text**` sections count must be at least N. */
const highlightedSections: InstructionChecker = (response, kwargs) => {
  const num = asNumber(kwargs.num_highlights, 'num_highlights')
  const count = (response.match(/\*[^\n*]+\*/g)?.length ?? 0) + (response.match(/\*\*[^\n*]+\*\*/g)?.length ?? 0)
  return count >= num
}

/** `Section 1` / `SECTION 2` section markers count must be at least N. */
const sections: InstructionChecker = (response, kwargs) => {
  const splitter = asString(kwargs.section_spliter, 'section_spliter')
  const num = asNumber(kwargs.num_sections, 'num_sections')
  const re = new RegExp(`\\s?${escapeRegExp(splitter)}\\s?\\d+\\s?`, 'g')
  const count = response.match(re)?.length ?? 0
  return count >= num
}

/** `***`-delimited paragraph count must be exact. */
const paragraphs: InstructionChecker = (response, kwargs) => {
  const num = asNumber(kwargs.num_paragraphs, 'num_paragraphs')
  const parts = response.split(/\s?\*\*\*\s?/).map((p) => p.trim())
  const nonEmpty = parts.filter((p) => p.length > 0)
  const hasEmptyMiddle = parts.some((p, i) => p.length === 0 && i > 0 && i < parts.length - 1)
  return !hasEmptyMiddle && nonEmpty.length === num
}

/** Response must end with a postscript marker (P.S. / P.P.S). */
const postscript: InstructionChecker = (response, kwargs) => {
  const marker = asString(kwargs.postscript_marker, 'postscript_marker').toLowerCase()
  const value = response.toLowerCase()
  if (marker === 'p.p.s') return /\s*p\.\s?p\.\s?s.*$/m.test(value)
  if (marker === 'p.s.') return /\s*p\.\s?s\..*$/m.test(value)
  return new RegExp(`\\s*${escapeRegExp(marker)}.*$`, 'm').test(value)
}

/** Response must contain a `<<title>>` non-empty title. */
const title: InstructionChecker = (response) => {
  const titles = response.match(/<<[^\n]+>>/g) ?? []
  return titles.some((t) => t.replace(/^<<|>>$/g, '').trim().length > 0)
}

/** Response must end with the given phrase (case/whitespace/quote-insensitive). */
const endChecker: InstructionChecker = (response, kwargs) => {
  const phrase = asString(kwargs.end_phrase, 'end_phrase').trim().toLowerCase()
  return response
    .trim()
    .replace(/^"+|"+$/g, '')
    .toLowerCase()
    .endsWith(phrase)
}

/** Response (trimmed) must be wrapped in double quotes. */
const quotation: InstructionChecker = (response) => {
  const value = response.trim()
  return value.length > 1 && value.startsWith('"') && value.endsWith('"')
}

/** Response must start with the given phrase (whitespace-insensitive). */
const constrainedStart: InstructionChecker = (response, kwargs) => {
  const starter = asString(kwargs.starter, 'starter')
  return new RegExp(`^\\s*${escapeRegExp(starter)}`).test(response)
}

/** Count of fully-capitalised words vs. a threshold. */
const capitalWordFrequency: InstructionChecker = (response, kwargs) => {
  const frequency = asNumber(kwargs.capital_frequency, 'capital_frequency')
  const rel = relationFrom('capital_relation', kwargs)
  const count = wordTokens(response).filter((w) => /^[A-Z]+$/.test(w)).length
  return compare(count, rel, frequency)
}

/** Response must contain no comma. */
const noComma: InstructionChecker = (response) => !response.includes(',')

/** Response must start by repeating the prompt (case/whitespace-insensitive). */
const repeatPrompt: InstructionChecker = (response, kwargs) => {
  const prompt = asString(kwargs.prompt_to_repeat, 'prompt_to_repeat').trim().toLowerCase()
  return response.trim().toLowerCase().startsWith(prompt)
}

/** Response must split into exactly two distinct responses by `******`. */
const twoResponses: InstructionChecker = (response) => {
  const parts = response.split('******').map((p) => p.trim())
  const nonEmpty = parts.filter((p) => p.length > 0)
  const hasEmptyMiddle = parts.some((p, i) => p.length === 0 && i > 0 && i < parts.length - 1)
  return !hasEmptyMiddle && nonEmpty.length === 2 && nonEmpty[0] !== nonEmpty[1]
}

/** All cased characters must be uppercase (at least one cased character). */
const englishCapital: InstructionChecker = (response) => {
  return /[A-Za-z]/.test(response) && response === response.toUpperCase()
}

/** All cased characters must be lowercase (at least one cased character). */
const englishLowercase: InstructionChecker = (response) => {
  return /[A-Za-z]/.test(response) && response === response.toLowerCase()
}

/** Response must contain at least `num_sections` numbered section markers. */
const multipleSections: InstructionChecker = (response, kwargs) => {
  const splitter = asString(kwargs.section_spliter, 'section_spliter')
  const num = asNumber(kwargs.num_sections, 'num_sections')
  const re = new RegExp(`\\s?${escapeRegExp(splitter)}\\s?\\d+\\s?`, 'g')
  const count = response.match(re)?.length ?? 0
  return count >= num
}

/** Response (after optional markdown fences) must parse as valid JSON. */
const jsonFormat: InstructionChecker = (response) => {
  let value = response.trim()
  for (const prefix of ['```json', '```Json', '```JSON', '```']) {
    if (value.startsWith(prefix)) {
      value = value.slice(prefix.length)
      break
    }
  }
  if (value.endsWith('```')) value = value.slice(0, -3)
  try {
    JSON.parse(value.trim())
    return true
  } catch {
    return false
  }
}

/**
 * Best-effort zero-dependency language detection. Returns an ISO 639-1 code
 * (`en`, `zh`, `fr`, `de`, `es`) or null when the language is not confidently
 * recognisable — matching the official IFEval behaviour of treating an
 * undetectable language as a pass rather than a failure.
 */
function detectLanguage(text: string): string | null {
  const lower = text.toLowerCase()
  const hits = (words: readonly string[]): number => words.filter((w) => lower.includes(w)).length
  if (hits([' the ', ' and ', ' is ', ' of ', ' to ', ' a ', ' in ', ' that ', ' it ', ' for ']) >= 2) return 'en'
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh'
  if (hits([' le ', ' la ', ' les ', ' de ', ' des ', ' et ', ' est ', ' un ', ' une ']) >= 2) return 'fr'
  if (hits([' der ', ' die ', ' das ', ' und ', ' ist ', ' ein ', ' eine ']) >= 2) return 'de'
  if (hits([' el ', ' la ', ' los ', ' las ', ' de ', ' y ', ' es ', ' un ', ' una ']) >= 2) return 'es'
  return null
}

/** Response must be in the requested language (undetectable = pass). */
const responseLanguage: InstructionChecker = (response, kwargs) => {
  const language = asString(kwargs.language, 'language')
  const detected = detectLanguage(response)
  return detected === null || detected === language
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Registry of supported IFEval instruction ids. */
export const instructionCheckers: Record<string, InstructionChecker> = {
  'keywords:existence': keywordsExistence,
  'keywords:forbidden_words': keywordsForbidden,
  'keywords:frequency': keywordsFrequency,
  'keywords:letter_frequency': keywordsLetterFrequency,
  'length_constraints:number_words': lengthNumberWords,
  'length_constraints:number_sentences': lengthNumberSentences,
  'detectable_content:number_placeholders': placeholders,
  'detectable_format:number_bullet_lists': bulletLists,
  'detectable_format:number_highlighted_sections': highlightedSections,
  'detectable_format:number_sections': sections,
  'detectable_format:multiple_sections': multipleSections,
  'detectable_format:json_format': jsonFormat,
  'detectable_format:number_paragraphs': paragraphs,
  'detectable_format:postscript': postscript,
  'detectable_format:title': title,
  'startend:end_checker': endChecker,
  'startend:quotation': quotation,
  'startend:constrained': constrainedStart,
  'change_case:capital_word_frequency': capitalWordFrequency,
  'change_case:english_capital': englishCapital,
  'change_case:english_lowercase': englishLowercase,
  'language:response_language': responseLanguage,
  'punctuation:no_comma': noComma,
  'combination:repeat_prompt': repeatPrompt,
  'combination:two_responses': twoResponses,
}

/** Check a single instruction against a response. */
export function checkInstruction(id: string, response: string, kwargs: Record<string, unknown>): boolean {
  const checker = instructionCheckers[id]
  if (checker === undefined) throw new Error(`IFEval: unsupported instruction id "${id}"`)
  return checker(response, kwargs)
}

/** Check every instruction in a list against a response (all must pass). */
export function checkInstructions(instructions: readonly InstructionCheck[], response: string): boolean {
  if (instructions.length === 0) return true
  return instructions.every((instruction) => checkInstruction(instruction.id, response, instruction.kwargs))
}

export interface InstructionFollowingScorerOptions {
  /** Metadata key holding the instruction id list, default "instruction_id_list". */
  instructionListKey?: string
  /** Metadata key holding the kwargs array, default "kwargs". */
  kwargsKey?: string
}

/**
 * Scores an IFEval sample: the response passes only if it satisfies every
 * verifiable instruction attached to the prompt.
 */
export class InstructionFollowingScorer implements Scorer {
  private readonly instructionListKey: string
  private readonly kwargsKey: string

  constructor(options: InstructionFollowingScorerOptions = {}) {
    this.instructionListKey = options.instructionListKey ?? 'instruction_id_list'
    this.kwargsKey = options.kwargsKey ?? 'kwargs'
  }

  score(sample: BenchmarkSample, output: string): ScoreResult {
    const idList = sample.metadata?.[this.instructionListKey]
    const kwargs = sample.metadata?.[this.kwargsKey]
    if (!Array.isArray(idList) || !Array.isArray(kwargs)) {
      throw new Error(`IFEval: sample "${sample.id}" is missing instruction_id_list or kwargs metadata`)
    }
    const instructions: InstructionCheck[] = idList.map((id, i) => ({
      id: String(id),
      kwargs: (kwargs[i] as Record<string, unknown> | undefined) ?? {},
    }))
    const correct = checkInstructions(instructions, output)
    return {
      sampleId: sample.id,
      correct,
      score: correct ? 1 : 0,
      details: { instructionIds: idList.map(String) },
    }
  }
}
