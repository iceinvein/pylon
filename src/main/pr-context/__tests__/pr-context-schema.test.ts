import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

type JsonSchema = Record<string, unknown>

async function loadSchema(): Promise<JsonSchema> {
  const path = join(process.cwd(), 'src/shared/pr-context-schema.json')
  return JSON.parse(await readFile(path, 'utf8')) as JsonSchema
}

/**
 * Minimal top-level validator. Checks root required fields and root property
 * type tags only. Does NOT recurse into nested required constraints. Intended
 * as a smoke test that the schema file loads and has a structurally valid
 * shape, not as a full JSON-schema validator.
 */
function validate(schema: JsonSchema, value: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  const required = (schema.required as string[] | undefined) ?? []
  const properties = (schema.properties as Record<string, JsonSchema>) ?? {}
  if (typeof value !== 'object' || value === null) {
    return { ok: false, errors: ['root not object'] }
  }
  const obj = value as Record<string, unknown>
  for (const key of required) {
    if (!(key in obj)) errors.push(`missing required: ${key}`)
  }
  for (const [key, sub] of Object.entries(properties)) {
    if (!(key in obj)) continue
    const type = sub.type as string | string[] | undefined
    if (!type) continue
    const actual = Array.isArray(obj[key]) ? 'array' : typeof obj[key]
    const allowed = Array.isArray(type) ? type : [type]
    if (!allowed.includes(actual))
      errors.push(`${key}: expected ${allowed.join('|')}, got ${actual}`)
  }
  return { ok: errors.length === 0, errors }
}

describe('pr-context-schema', () => {
  test('accepts a minimal valid bundle', async () => {
    const schema = await loadSchema()
    const bundle = {
      version: 1,
      generatedAt: Date.now(),
      mode: 'heuristic',
      pr: { number: 1, headBranch: 'a', baseBranch: 'b', title: 't' },
      files: [],
      notes: [],
    }
    expect(validate(schema, bundle)).toEqual({ ok: true, errors: [] })
  })

  test('rejects bundle missing required fields', async () => {
    const schema = await loadSchema()
    const result = validate(schema, { version: 1 })
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
