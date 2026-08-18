/**
 * A dependency-free arithmetic expression evaluator. It parses and evaluates
 * integer and decimal literals with the four binary operators (`+ - * /`),
 * unary `+`/`-`, parentheses and arbitrary whitespace, using a recursive-descent
 * parser with standard operator precedence (`* /` bind tighter than `+ -`).
 *
 * This powers the deterministic-offload solver: stable arithmetic is moved out
 * of the LLM into exact code (the "deterministic code solver" from
 * arXiv:2608.12307), so no model call is made for a computable input.
 */

/** Evaluate an arithmetic expression, returning a finite number. */
export function evaluateArithmetic(expression: string): number {
  const parser = new Parser(expression)
  const value = parser.parseExpression()
  parser.skipWhitespace()
  if (!parser.atEnd()) {
    throw new Error(`evaluateArithmetic: unexpected token at position ${parser.position}`)
  }
  return value
}

class Parser {
  private pos = 0

  constructor(private readonly src: string) {}

  get position(): number {
    return this.pos
  }

  atEnd(): boolean {
    return this.pos >= this.src.length
  }

  skipWhitespace(): void {
    while (this.pos < this.src.length && isWhitespace(this.src[this.pos]!)) this.pos++
  }

  private peek(): string | undefined {
    return this.src[this.pos]
  }

  /** expression := term (('+' | '-') term)* */
  parseExpression(): number {
    let value = this.parseTerm()
    for (;;) {
      this.skipWhitespace()
      const c = this.peek()
      if (c === '+') {
        this.pos++
        value += this.parseTerm()
      } else if (c === '-') {
        this.pos++
        value -= this.parseTerm()
      } else {
        break
      }
    }
    return value
  }

  /** term := factor (('*' | '/') factor)* */
  private parseTerm(): number {
    let value = this.parseFactor()
    for (;;) {
      this.skipWhitespace()
      const c = this.peek()
      if (c === '*') {
        this.pos++
        value *= this.parseFactor()
      } else if (c === '/') {
        this.pos++
        const divisor = this.parseFactor()
        if (divisor === 0) throw new Error('evaluateArithmetic: division by zero')
        value /= divisor
      } else {
        break
      }
    }
    return value
  }

  /** factor := ('+' | '-') factor | '(' expression ')' | number */
  private parseFactor(): number {
    this.skipWhitespace()
    const c = this.peek()
    if (c === '+') {
      this.pos++
      return this.parseFactor()
    }
    if (c === '-') {
      this.pos++
      return -this.parseFactor()
    }
    if (c === '(') {
      this.pos++
      const value = this.parseExpression()
      this.skipWhitespace()
      if (this.peek() !== ')') throw new Error('evaluateArithmetic: expected ")"')
      this.pos++
      return value
    }
    return this.parseNumber()
  }

  private parseNumber(): number {
    this.skipWhitespace()
    const start = this.pos
    while (this.pos < this.src.length && isDigit(this.src[this.pos]!)) this.pos++
    if (this.pos < this.src.length && this.src[this.pos] === '.') {
      this.pos++
      while (this.pos < this.src.length && isDigit(this.src[this.pos]!)) this.pos++
    }
    if (this.pos === start) throw new Error(`evaluateArithmetic: expected a number at position ${start}`)
    const value = Number(this.src.slice(start, this.pos))
    if (!Number.isFinite(value)) throw new Error(`evaluateArithmetic: invalid number at position ${start}`)
    return value
  }
}

function isWhitespace(c: string): boolean {
  return /\s/.test(c)
}

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9'
}
