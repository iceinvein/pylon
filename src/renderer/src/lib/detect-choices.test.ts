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

  describe('ready to <action> confirmation (false positives)', () => {
    test('returns null for "Ready to execute?" as confirmation question', () => {
      const text = `Plan complete. Ready to execute?

1. Option A — First approach
2. Option B — Second approach`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "Ready to proceed?" as confirmation question', () => {
      const text = `1. Auth module — JWT tokens
2. Database — PostgreSQL

Ready to proceed?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "Ready to start?" as confirmation question', () => {
      const text = `1. Build the frontend
2. Set up the API
3. Write the tests

Ready to start?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "Ready to deploy?"', () => {
      const text = `1. Service A — Updated
2. Service B — New

Ready to deploy?`

      expect(detectChoices(text)).toBeNull()
    })

    test('still detects choices with "Ready to pick?" (selection intent)', () => {
      const text = `1. Option A — First
2. Option B — Second

Ready to pick one?`

      const result = detectChoices(text)
      // "ready to pick" — "pick" is not in the confirmation exclusion list,
      // and the question still matches SELECTION_QUESTION_RE via "ready to"
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(2)
    })

    test('still detects choices with "Ready to choose?"', () => {
      const text = `1. Plan A — Conservative
2. Plan B — Aggressive

Ready to choose?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
    })
  })

  describe('paragraph-length items (false positives)', () => {
    test('returns null when items are full paragraphs (> 200 chars)', () => {
      const text = `Which approach would you prefer?

1. The **help** command forced a scope decision — we originally had it as global (no session needed), but since it injects a system message into the chat, it actually does need a session. This is the kind of thing that static type analysis will not catch.

2. **permissionMode** lives in unexpected places — it is local React state in SessionView.tsx, not in the Zustand session store. This is because it is a per-view concern that gets synced to the main process via IPC.

3. The **SLASH_EXECUTE** IPC channel in ipc-channels.ts tells a story — someone previously planned a main-process command handler but backed away from it. Our renderer-only approach avoids that complexity entirely.`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null when any single item exceeds 200 chars', () => {
      const text = `Which do you prefer?

1. Short option — Brief
2. This is a very long option that goes into extensive detail about the architecture, covering multiple aspects of the system design including the database schema, the API layer, the frontend components, and the deployment strategy which makes it clearly not a selectable choice`

      expect(detectChoices(text)).toBeNull()
    })

    test('still detects choices when items are short', () => {
      const text = `1. Fast — Quick but less accurate
2. Accurate — Slow but thorough

Which approach?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(2)
    })
  })

  describe('insight/observation preambles (false positives)', () => {
    test('returns null for "worth noting" preamble', () => {
      const text = `One thing worth noting about the design:

1. Auth uses JWT — Token-based
2. Sessions are stateless — No server storage

Which do you prefer?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "insight" in preamble', () => {
      const text = `Here is an insight:

1. Component A — Does auth
2. Component B — Does routing

Which approach?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "observations" preamble', () => {
      const text = `My observations:

1. Performance improved — 2x faster
2. Bundle size reduced — 30% smaller

Which option?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "findings" preamble', () => {
      const text = `Key findings:

1. Auth flow — Has a race condition
2. Data layer — Missing validation

Which do you want to fix?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "things to note" preamble', () => {
      const text = `A few things to note:

1. Config A — Changed default
2. Config B — New setting

Which one?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "keep in mind" preamble', () => {
      const text = `Keep in mind:

1. Trade-off A — More speed, less safety
2. Trade-off B — More safety, less speed

Which do you prefer?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "for context" preamble', () => {
      const text = `For context:

1. Approach A — Used by Team X
2. Approach B — Used by Team Y

Which approach?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "design decisions" preamble', () => {
      const text = `Here are the design decisions:

1. REST API — Simpler to implement
2. GraphQL — More flexible queries

Which option?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "what I found" preamble', () => {
      const text = `Here is what I found:

1. Issue A — Critical severity
2. Issue B — Low severity

Which do you want to fix first?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for "breakdown of" preamble', () => {
      const text = `Here is a breakdown of the changes:

1. Auth — Refactored
2. API — Updated endpoints

Which one?`

      expect(detectChoices(text)).toBeNull()
    })
  })

  describe('exact screenshot reproduction', () => {
    test('returns null for insight block with distant "Ready to execute?" question', () => {
      const text = `Plan complete and saved to \`docs/superpowers/plans/2026-03-17-command-registry.md\`. Ready to execute?

\`★ Insight ─────────────────────────────────────\`
One thing worth noting about the design journey here:

1. The **\`help\`** command forced a scope decision — we originally had it as \`global\` (no session needed), but since it injects a system message into the chat, it actually does need a session. This is the kind of thing that static type analysis won't catch — the \`execute\` function signature allows any behavior, so the constraint is semantic, not structural.

2. **\`permissionMode\`** lives in unexpected places — it's local React state in \`SessionView.tsx\`, not in the Zustand session store. This is because it's a per-view concern that gets synced to the main process via IPC. The CommandPalette can't access it without prop-drilling or a store migration. For now, defaulting to \`'default'\` is fine since it's purely informational in the \`/status\` command.

3. The **\`SLASH_EXECUTE\`** IPC channel in \`ipc-channels.ts\` tells a story — someone previously planned a main-process command handler but backed away from it. Our renderer-only approach avoids that complexity entirely.
\`─────────────────────────────────────────────────\``

      expect(detectChoices(text)).toBeNull()
    })
  })

  describe('preamble distance limits', () => {
    test('returns null when question is too many lines before the list', () => {
      const text = `Which option do you prefer?

Here is some context about the problem.

We looked into several possibilities.

After careful analysis, here are the candidates:

Some more introductory text.

And even more text separating things.

1. Option A — First
2. Option B — Second`

      // The question is more than 8 lines away — should not associate
      expect(detectChoices(text)).toBeNull()
    })

    test('still detects choices when question is close in preamble', () => {
      const text = `Which option do you prefer?

1. Option A — First
2. Option B — Second`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(2)
    })
  })

  describe('option-labeled choices (Option A/B/C style)', () => {
    test('detects bold option labels with em-dash separator', () => {
      const text = `This is a meaningful design choice. Here's the trade-off:

**Option A** — Add lightweight markdown support to SystemMessage
**Option B** — Change the commands to not emit markdown
**Option C** — Import ReactMarkdown for full markdown

Which approach do you prefer?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(3)
      expect(result?.choices[0].label).toBe('Option A')
      expect(result?.choices[0].description).toBe(
        'Add lightweight markdown support to SystemMessage',
      )
      expect(result?.choices[1].label).toBe('Option B')
      expect(result?.choices[2].label).toBe('Option C')
      expect(result?.questionText).toContain('Which approach do you prefer?')
    })

    test('detects plain option labels without bold', () => {
      const text = `Option A — Fast execution with less accuracy
Option B — Accurate but slower

Which do you prefer?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(2)
      expect(result?.choices[0].label).toBe('Option A')
      expect(result?.choices[0].description).toBe('Fast execution with less accuracy')
    })

    test('detects option labels with colon separator', () => {
      const text = `**Option A**: Use SQLite for simplicity
**Option B**: Use PostgreSQL for scalability

Which option?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(2)
      expect(result?.choices[0].label).toBe('Option A')
      expect(result?.choices[0].description).toBe('Use SQLite for simplicity')
    })

    test('detects option labels with spaced hyphen separator', () => {
      const text = `Option A - Minimal changes
Option B - Full refactor

Which approach?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(2)
    })

    test('detects Choice keyword', () => {
      const text = `**Choice A** — Keep the existing API
**Choice B** — Redesign from scratch

Which do you prefer?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices[0].label).toBe('Choice A')
      expect(result?.choices[1].label).toBe('Choice B')
    })

    test('detects Approach keyword', () => {
      const text = `**Approach A** — Conservative migration
**Approach B** — Big bang rewrite

Which approach?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices[0].label).toBe('Approach A')
    })

    test('detects numbered option identifiers', () => {
      const text = `**Option 1** — Quick fix
**Option 2** — Proper refactor

Which option?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(2)
      expect(result?.choices[0].label).toBe('Option 1')
      expect(result?.choices[1].label).toBe('Option 2')
    })

    test('detects option labels with blank lines between items', () => {
      const text = `**Option A** — Use React

**Option B** — Use Vue

**Option C** — Use Svelte

Which framework do you prefer?`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(3)
    })

    test('detects option labels with preamble question', () => {
      const text = `Which would you prefer?

**Option A** — Keep it simple
**Option B** — Make it powerful`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(2)
    })

    test('returns null for non-sequential identifiers', () => {
      const text = `**Option A** — First
**Option C** — Third (skipped B)

Which option?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for mixed keywords', () => {
      const text = `**Option A** — First approach
**Choice B** — Second approach

Which do you prefer?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for single option item', () => {
      const text = `**Option A** — The only choice

Which option?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for option items without question', () => {
      const text = `**Option A** — First approach
**Option B** — Second approach`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for action-offer question with options', () => {
      const text = `**Option A** — Quick fix
**Option B** — Full refactor

Want me to go with Option A?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for informational preamble with options', () => {
      const text = `Key findings:

**Option A** — Has a bug
**Option B** — Works fine

Which option?`

      expect(detectChoices(text)).toBeNull()
    })

    test('returns null for paragraph-length option descriptions', () => {
      const text = `**Option A** — This is a very long description that goes into extensive detail about the architecture, covering multiple aspects of the system design including the database schema, the API layer, the frontend components, and the deployment strategy which makes it clearly explanatory
**Option B** — Short

Which option?`

      expect(detectChoices(text)).toBeNull()
    })

    test('exact screenshot reproduction: design trade-off with 3 options', () => {
      const text = `This is a meaningful design choice. Here's the trade-off:

**Option A** — Add lightweight markdown support to \`SystemMessage\` (regex for \`**bold**\` + \`whitespace-pre-line\`). This means any future system message with bold or newlines "just works."

**Option B** — Change the \`/status\` and \`/help\` commands to not emit markdown — just plain text. Keep \`SystemMessage\` dead-simple.

**Option C** — Import \`ReactMarkdown\` into \`SystemMessage\` for full markdown. Most powerful but heaviest change.

Which approach do you prefer? I'd lean toward **A** — a tiny inline parser keeps the component lightweight while supporting the formatted output our commands need. But your call.`

      const result = detectChoices(text)
      expect(result).not.toBeNull()
      expect(result?.choices).toHaveLength(3)
      expect(result?.choices[0].label).toBe('Option A')
      expect(result?.choices[1].label).toBe('Option B')
      expect(result?.choices[2].label).toBe('Option C')
      expect(result?.questionText).toContain('Which approach do you prefer?')
    })
  })
})
