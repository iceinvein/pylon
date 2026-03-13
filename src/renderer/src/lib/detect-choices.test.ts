import { describe, expect, test } from 'bun:test'
import { detectChoices } from './detect-choices'

describe('detectChoices', () => {
  describe('numbered lists with period separator', () => {
    test('detects numbered list with em-dash separator and trailing question', () => {
      const text = `Which approach would you prefer?

1. Fast — Quick but less accurate
2. Accurate — Slow but thorough
3. Balanced — Middle ground`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(3)
      expect(result?.choices[0].label).toBe('Fast')
      expect(result?.choices[0].description).toBe('Quick but less accurate')
      expect(result?.choices[1].label).toBe('Accurate')
      expect(result?.choices[1].description).toBe('Slow but thorough')
      expect(result?.choices[2].label).toBe('Balanced')
      expect(result?.choices[2].description).toBe('Middle ground')
      expect(result?.questionText).toContain('Which approach would you prefer?')
    })

    test('detects numbered list with question after the list', () => {
      const text = `Here are your options:

1. Option A — First choice
2. Option B — Second choice

Which do you prefer?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(2)
      expect(result?.questionText).toContain('Which do you prefer?')
    })

    test('question immediately after last item (no blank line)', () => {
      const text = `1. Alpha — First
2. Beta — Second
Which one?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(2)
      expect(result?.questionText).toContain('Which one?')
    })
  })

  describe('numbered lists with parenthesis format', () => {
    test('detects numbered list with parenthesis format', () => {
      const text = `1) React — Component-based UI
2) Vue — Progressive framework
3) Svelte — Compile-time framework

Which framework fits your needs?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(3)
      expect(result?.choices[0].label).toBe('React')
      expect(result?.choices[0].description).toBe('Component-based UI')
      expect(result?.choices[2].label).toBe('Svelte')
    })
  })

  describe('lettered lists with period format', () => {
    test('detects lettered list with period', () => {
      const text = `A. TypeScript — Typed JavaScript
B. JavaScript — Untyped but flexible
C. Rust — Systems language

What would you like to use?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(3)
      expect(result?.choices[0].label).toBe('TypeScript')
      expect(result?.choices[0].description).toBe('Typed JavaScript')
      expect(result?.choices[1].label).toBe('JavaScript')
    })

    test('detects lowercase lettered list with period', () => {
      const text = `a. Option one — Description one
b. Option two — Description two

Which option?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(2)
      expect(result?.choices[0].label).toBe('Option one')
    })
  })

  describe('lettered lists with parenthesis format', () => {
    test('detects lettered list with parenthesis', () => {
      const text = `A) Small — Compact size
B) Medium — Standard size
C) Large — Full size

What size do you need?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(3)
      expect(result?.choices[0].label).toBe('Small')
      expect(result?.choices[1].label).toBe('Medium')
    })

    test('detects lowercase lettered list with parenthesis', () => {
      const text = `a) First — One
b) Second — Two

Which?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(2)
    })
  })

  describe('separators', () => {
    test('en-dash separator splits label and description', () => {
      const text = `1. Fast – Quick execution
2. Safe – No side effects

Which approach?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices[0].label).toBe('Fast')
      expect(result?.choices[0].description).toBe('Quick execution')
    })

    test('hyphen separator splits label and description', () => {
      const text = `1. Fast - Quick execution
2. Safe - No side effects

Which approach?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices[0].label).toBe('Fast')
      expect(result?.choices[0].description).toBe('Quick execution')
    })

    test('colon separator splits label and description', () => {
      const text = `1. Fast: Quick execution
2. Safe: No side effects

Which approach?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices[0].label).toBe('Fast')
      expect(result?.choices[0].description).toBe('Quick execution')
    })

    test('items with no separator produce empty description', () => {
      const text = `1. Option Alpha
2. Option Beta

Which one do you want?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices[0].label).toBe('Option Alpha')
      expect(result?.choices[0].description).toBe('')
      expect(result?.choices[1].label).toBe('Option Beta')
      expect(result?.choices[1].description).toBe('')
    })
  })

  describe('bold markdown stripping', () => {
    test('strips bold markdown from labels', () => {
      const text = `1. **TypeScript** — Typed JavaScript superset
2. **JavaScript** — Dynamic scripting language

Which do you prefer?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices[0].label).toBe('TypeScript')
      expect(result?.choices[0].description).toBe('Typed JavaScript superset')
      expect(result?.choices[1].label).toBe('JavaScript')
    })

    test('strips bold markdown from labels with colon separator', () => {
      const text = `1. **Alpha**: First option
2. **Beta**: Second option

Which?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices[0].label).toBe('Alpha')
      expect(result?.choices[1].label).toBe('Beta')
    })
  })

  describe('boundary cases', () => {
    test('maximum 6 items is accepted', () => {
      const text = `1. One — First
2. Two — Second
3. Three — Third
4. Four — Fourth
5. Five — Fifth
6. Six — Sixth

Which one?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(6)
    })

    test('minimum 2 items is accepted', () => {
      const text = `1. Yes — Proceed
2. No — Cancel

Shall we continue?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(2)
    })

    test('more than 6 items returns null', () => {
      const text = `1. One — First
2. Two — Second
3. Three — Third
4. Four — Fourth
5. Five — Fifth
6. Six — Sixth
7. Seven — Seventh

Which one?`

      const result = detectChoices(text)
      expect(result).toBeNull()
    })

    test('only 1 item returns null', () => {
      const text = `1. Only option — Just one

Which one?`

      const result = detectChoices(text)
      expect(result).toBeNull()
    })
  })

  describe('null cases', () => {
    test('plain text without choices returns null', () => {
      const text = `This is just a normal paragraph of text with no choices or options listed.`

      const result = detectChoices(text)
      expect(result).toBeNull()
    })

    test('numbered list without trailing question returns null', () => {
      const text = `1. First item — Description one
2. Second item — Description two
3. Third item — Description three`

      const result = detectChoices(text)
      expect(result).toBeNull()
    })

    test('numbered list with question too far after last item returns null', () => {
      const text = `1. First item — Description one
2. Second item — Description two

Some extra paragraph here.

And another paragraph here.

Which one?`

      const result = detectChoices(text)
      expect(result).toBeNull()
    })

    test('empty string returns null', () => {
      expect(detectChoices('')).toBeNull()
    })

    test('question-only text returns null', () => {
      expect(detectChoices('What would you like to do?')).toBeNull()
    })
  })

  describe('blank lines between items', () => {
    test('allows blank lines between list items', () => {
      const text = `1. First — Description one

2. Second — Description two

3. Third — Description three

Which do you prefer?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(3)
      expect(result?.choices[0].label).toBe('First')
      expect(result?.choices[1].label).toBe('Second')
      expect(result?.choices[2].label).toBe('Third')
    })
  })

  describe('rawText field', () => {
    test('rawText contains the full original item line', () => {
      const text = `1. **Fast** — Quick execution
2. Accurate — Slow but thorough

Which approach?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices[0].rawText).toContain('Fast')
      expect(result?.choices[1].rawText).toContain('Accurate')
    })
  })

  describe('open-ended questions (false positives)', () => {
    test('returns null for instruction list followed by "What do you see?"', () => {
      const text = `Try:

1. Kill the dev server (Ctrl+C)
2. Run bun run dev again
3. Open an existing session
4. Check the terminal for output

What do you see?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for steps followed by "What happened?"', () => {
      const text = `1. Run the build command
2. Check the output folder
3. Open index.html

What happened?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "How does it look?"', () => {
      const text = `1. Option A — first
2. Option B — second

How does it look?`

      expect(detectChoices(text)).toBeNull()
    })

    test('detects choices with "Which approach?"', () => {
      const text = `1. Fast — Quick execution
2. Safe — No side effects

Which approach?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(2)
    })

    test('detects choices with "What do you prefer?"', () => {
      const text = `1. React — Component library
2. Vue — Progressive framework

What do you prefer?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
    })

    test('detects choices with "Would you like to go with?"', () => {
      const text = `1. Option A — Description A
2. Option B — Description B

Would you like to go with one of these?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
    })

    test('detects choices with "Does this look right?"', () => {
      const text = `1. Approach A — Conservative
2. Approach B — Aggressive

Does this look right?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
    })

    test('detects choices with "Shall we proceed?"', () => {
      const text = `1. Deploy now — Ship immediately
2. Wait — Deploy tomorrow

Shall we go with one of these?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
    })
  })

  describe('informational lists (false positives)', () => {
    test('returns null for "you should see:" preamble with unrelated question', () => {
      const text = `After deploying this, you should see:

1. GTM debugger consistently logging events (no more intermittent silence)
2. Session Start events recovering to pre-Jan-17 levels within 24-48 hours
3. Game Page View, Prod View, and Purchase events recovering proportionally
4. The full funnel (session → game view → product view → purchase) should re-align with the expected value bands in your GA anomaly charts

Want me to also check if the reactGA.ts wrapper (which forwards events to the native app via postMessage) in v1.98.0+ has any issues, or would you prefer to deploy this fix first and measure the impact?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "you will see" preamble', () => {
      const text = `After running the migration, you will see:

1. New columns added to the users table
2. Indexes rebuilt for faster queries
3. Deprecated fields removed

Want me to run the migration now?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "expected results" preamble', () => {
      const text = `Expected results:

1. Build time reduced by 40%
2. Bundle size under 200KB
3. Lighthouse score above 90

Shall I deploy this?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "after running" preamble', () => {
      const text = `After running the tests:

1. Unit tests should all pass
2. Integration tests may show warnings

Do you want me to fix the warnings?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for action-offer question "want me to"', () => {
      const text = `1. Fix the auth bug — Critical severity
2. Update the deps — Low severity

Want me to start with the auth bug?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for action-offer question "shall I"', () => {
      const text = `1. Option A — First approach
2. Option B — Second approach

Shall I implement option A?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for action-offer question "would you like me to"', () => {
      const text = `1. Component refactor — Extract shared logic
2. API cleanup — Remove deprecated endpoints

Would you like me to start with the refactor?`

      expect(detectChoices(text)).toBeNull()
    })

    test('still detects real choices with "shall we"', () => {
      const text = `1. Deploy now — Ship immediately
2. Wait — Deploy tomorrow

Shall we go with one of these?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(2)
    })
  })

  describe('mixed content', () => {
    test('detects choices embedded in longer text with preamble', () => {
      const text = `I can help you with that. Here are the available options:

1. Quick setup — Get started immediately
2. Custom setup — Configure everything yourself

Which would you prefer?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(2)
    })
  })

  describe('confirmation/approval questions (false positives)', () => {
    test('returns null for recap list with "does this look right, or adjust" question', () => {
      const text = `That covers the full design. To recap the key changes from current state:

1. **Project picker** — explicit dropdown, reuses \`listProjects()\`
2. **Multi-exploration** — per-exploration Maps in store, concurrent runs
3. **Server auto-detection** — deterministic \`project-scanner.ts\`, agent handles starting
4. **AI goal suggestions** — background Claude call analyzes repo, presents checkable goals
5. **Progressive form** — defaults are automated, every field has manual override
6. **Two launch modes** — guided (review goals) and full auto (one-click)

Does this design look right, or do you want to adjust anything before I write it up as a spec?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "to summarize" preamble', () => {
      const text = `To summarize:

1. Auth system — JWT with refresh tokens
2. Database — PostgreSQL with Prisma
3. Cache — Redis for sessions

Does this sound good, or do you want to change anything?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "adjust anything before I" pattern', () => {
      const text = `1. Component A — Handles auth
2. Component B — Handles routing
3. Component C — Handles state

Does this look right, or do you want to adjust anything before I implement it?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "before I write" without adjustment language', () => {
      const text = `1. Feature A — First feature
2. Feature B — Second feature

Looks right? Want to tweak anything before I start building?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "change anything" in question', () => {
      const text = `1. Step one — First
2. Step two — Second
3. Step three — Third

Would you like to change anything?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "modify any of these" in question', () => {
      const text = `1. Config A — Setting one
2. Config B — Setting two

Do you want to modify any of these before we proceed?`

      expect(detectChoices(text)).toBeNull()
    })

    test('still detects real choices with "does this look right" when no adjustment clause', () => {
      const text = `1. Approach A — Conservative
2. Approach B — Aggressive

Does this look right?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
    })

    test('returns null for "key changes" preamble', () => {
      const text = `Here are the key changes:

1. New auth flow — OAuth2 integration
2. Updated API — REST to GraphQL

Does this look right?`

      expect(detectChoices(text)).toBeNull()
    })
  })
})
