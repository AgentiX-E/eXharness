import type { PromptTemplate } from './types.js'

/**
 * A minimal `{placeholder}` prompt template. Unknown variables are replaced
 * with the empty string; the special `task` variable carries the input task.
 */
export class TemplatePrompt implements PromptTemplate {
  constructor(private readonly template: string) {}

  render(variables: Record<string, unknown>): string {
    return this.template.replace(/\{(\w+)\}/g, (match, key: string) => {
      const value = variables[key]
      return value === undefined ? '' : String(value)
    })
  }
}
