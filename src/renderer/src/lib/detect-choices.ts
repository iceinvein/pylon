export type DetectedChoice = {
  label: string
  description: string
  rawText: string
}

export type DetectedChoices = {
  choices: DetectedChoice[]
  questionText: string
}

// Matches any list item line for numbered or lettered formats so we can collect
// the full sequence before applying the 2–6 count constraint.
// Accepts any digit (not just 1-6) and any letter (not just a-f) during
// collection so over-long lists are properly detected and rejected.
const ITEM_LINE_RE = /^(?:\d+[.)]\s+|[a-zA-Z][.)]\s+)(.+)$/

// Narrower regex used to validate that a detected prefix is within the
// allowed range: digits 1-6 or letters a-f (case-insensitive).
const VALID_PREFIX_RE = /^([1-6]|[a-fA-F])$/

// Maximum allowed content length (after prefix stripping) for a single item.
// Real choices are brief labels with optional short descriptions. Items that
// exceed this are paragraph-length explanations, findings, or design notes —
// not selectable choices.
const MAX_ITEM_CONTENT_LENGTH = 200

// Maximum absolute line distance from the first list item back to a preamble
// question. Prevents associating distant, semantically unrelated questions
// with a numbered list that appears much later in the text.
const MAX_PREAMBLE_LINE_DISTANCE = 8

/**
 * Strips **bold** markdown wrappers from a string.
 * Only removes paired double-asterisks; content is preserved.
 */
function stripBold(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1')
}

/**
 * Trims and strips bold from a label string.
 */
function cleanLabel(raw: string): string {
  return stripBold(raw.trim())
}

/**
 * Parses the content portion of a list item (everything after the prefix) into
 * a label and an optional description, applying bold-stripping to the label.
 */
function parseItemContent(content: string): { label: string; description: string } {
  // Try em-dash first
  const emDashIdx = content.indexOf('—')
  const enDashIdx = content.indexOf('–')
  const colonIdx = content.indexOf(':')

  // Find hyphen that is surrounded by spaces (inline separator, not prefix dash)
  const hyphenMatch = content.match(/^(.*?)\s+-\s+(.+)$/)

  // Collect candidate split positions
  type Candidate = { idx: number; labelEnd: number; descStart: number }
  const candidates: Candidate[] = []

  if (emDashIdx !== -1) {
    candidates.push({ idx: emDashIdx, labelEnd: emDashIdx, descStart: emDashIdx + 1 })
  }
  if (enDashIdx !== -1) {
    candidates.push({ idx: enDashIdx, labelEnd: enDashIdx, descStart: enDashIdx + 1 })
  }
  if (colonIdx !== -1) {
    candidates.push({ idx: colonIdx, labelEnd: colonIdx, descStart: colonIdx + 1 })
  }

  // Sort by position and take the earliest separator found
  candidates.sort((a, b) => a.idx - b.idx)

  if (candidates.length > 0) {
    const { labelEnd, descStart } = candidates[0]
    const label = cleanLabel(content.slice(0, labelEnd))
    const description = content.slice(descStart).trim()
    return { label, description }
  }

  // Fall back to spaced-hyphen match
  if (hyphenMatch) {
    return {
      label: cleanLabel(hyphenMatch[1]),
      description: hyphenMatch[2].trim(),
    }
  }

  // No separator found — whole content is the label
  return { label: cleanLabel(content), description: '' }
}

/**
 * Questions that indicate selection intent (asking user to pick from the list).
 * We match against the lowercased question text. If none of these patterns match,
 * the question is likely open-ended (e.g. "What do you see?") and the list is
 * instructions/steps rather than choices.
 */
const SELECTION_QUESTION_RE =
  /\b(which|prefer|choose|pick|select|go with|want to|need|option|approach|sound good|shall (we|i)|ready to|look(s?) right|feel(s?) right|would you like|what do you think|does this|do you want)\b/i

/**
 * Questions where the assistant is offering to perform an action rather than
 * asking the user to choose from the list above. These override SELECTION_QUESTION_RE.
 * e.g. "Want me to also check…?" or "Shall I run the tests?"
 */
const ACTION_OFFER_RE =
  /\b(want me to|shall i|would you like me to|do you want me to|should i|let me know if|i can also|i could also|need me to)\b/i

/**
 * Preamble text that signals the list is informational (outcomes, steps,
 * expected results) rather than a set of choices for the user to pick from.
 * Also matches recap/summary language where the list reviews prior decisions.
 */
const INFORMATIONAL_PREAMBLE_RE =
  /\b(you (should|will|would|can) see|you('ll| will) (get|have|notice)|expected (results|output|behavior|outcome)|here('s| is| are) (what|the (step|result|output))|the following (will|should|are)|after (deploying|running|doing|applying|completing|installing|updating|merging)|steps to|once (you|this|it)|in order to|to recap|to summarize|in summary|here('s| is) a summary|that covers|key changes|changes from|overview of|worth noting|things? to note|points? to note|observations?|findings?|notes? on|notable|keep in mind|be aware|for (context|reference)|design (decisions?|rationale)|what (I|we) (found|noticed|learned|discovered)|breakdown of|highlights?)\b|\binsight\b/i

/**
 * Questions that seek confirmation or approval of the entire set rather than
 * asking the user to pick a single item. These override SELECTION_QUESTION_RE.
 * e.g. "Does this design look right, or do you want to adjust anything before I write it up?"
 *
 * Pattern: a "looks right / sound good" confirmation combined with an "or adjust/change" clause,
 * or a "before I [verb]" clause that signals the assistant is about to act on the whole set.
 */
const CONFIRMATION_QUESTION_RE =
  /\b(adjust|modify|tweak|change) (anything|something|any of (these|this|them))\b|\bbefore I (write|implement|proceed|start|begin|create|build|draft|send|submit|deploy|push|merge|ship)\b|\bready to (execute|proceed|go|start|begin|ship|deploy|move|continue|implement|build|run|launch|push|merge|kick)\b/i

/**
 * Checks whether a question string indicates the user should SELECT from the
 * list above, as opposed to open-ended follow-ups like "What do you see?",
 * action offers like "Want me to also check…?", or confirmation questions
 * like "Does this look right, or do you want to adjust anything?"
 */
function isSelectionQuestion(question: string): boolean {
  if (ACTION_OFFER_RE.test(question)) return false
  if (CONFIRMATION_QUESTION_RE.test(question)) return false
  return SELECTION_QUESTION_RE.test(question)
}

/**
 * Checks whether a preamble line indicates the list is informational rather
 * than a set of selectable choices.
 */
function isInformationalPreamble(preamble: string): boolean {
  return INFORMATIONAL_PREAMBLE_RE.test(preamble)
}

/**
 * Detects numbered or lettered choice lists (2–6 items) in assistant text.
 *
 * Returns the parsed choices and the associated question text when a valid
 * pattern is found; returns null otherwise.
 *
 * Rules:
 * - Numbered: `1.` / `1)` through `6.` / `6)` — 2 to 6 items
 * - Lettered: `A.` / `A)` through `F.` / `F)` (case-insensitive) — 2 to 6 items
 * - Must be followed by a question (`?`) within 1–3 lines after the last item
 * - The question must express selection intent (not open-ended like "What do you see?")
 * - Blank lines between items are allowed
 * - Labels have bold markdown (`**…**`) stripped
 * - Separator characters: `—`, `–`, `-` (spaced), `:`
 */
export function detectChoices(text: string): DetectedChoices | null {
  if (!text.trim()) return null

  const lines = text.split('\n')

  // Walk through lines to find sequences of matching list items.
  // We collect contiguous item lines (ignoring blank-only lines between them).

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!ITEM_LINE_RE.test(trimmed)) {
      i++
      continue
    }

    // We found the start of a potential list. Determine whether it is numbered
    // or lettered so we can validate sequence consistency.
    const firstPrefix = trimmed.match(/^(\d+|[a-zA-Z])[.)]/)?.[1]
    if (!firstPrefix) {
      i++
      continue
    }
    const isNumbered = /^\d+$/.test(firstPrefix)

    const itemLines: string[] = [trimmed]
    let j = i + 1

    // Collect remaining items, skipping blank lines between them.
    while (j < lines.length) {
      const candidate = lines[j].trim()

      if (candidate === '') {
        // A blank line is allowed between items — peek ahead for next item.
        j++
        continue
      }

      if (ITEM_LINE_RE.test(candidate)) {
        const prefix = candidate.match(/^(\d+|[a-zA-Z])[.)]/)?.[1] ?? ''
        const candidateIsNumbered = /^\d+$/.test(prefix)

        // Must be the same list style (numbered vs lettered).
        if (candidateIsNumbered !== isNumbered) break

        itemLines.push(candidate)
        j++
      } else {
        // Non-blank, non-item line — stop collecting items.
        break
      }
    }

    const count = itemLines.length

    // Validate item count: must be 2–6.
    if (count < 2 || count > 6) {
      i = j
      continue
    }

    // Validate that all prefixes are within the allowed range (1-6 or a-f).
    const prefixes = itemLines.map((l) => l.match(/^(\d+|[a-zA-Z])[.)]/)?.[1] ?? '')
    if (!prefixes.every((p) => VALID_PREFIX_RE.test(p))) {
      i = j
      continue
    }
    let sequenceValid = true

    if (isNumbered) {
      for (let k = 0; k < prefixes.length; k++) {
        if (Number(prefixes[k]) !== k + 1) {
          sequenceValid = false
          break
        }
      }
    } else {
      const base = prefixes[0].toLowerCase().charCodeAt(0)
      for (let k = 0; k < prefixes.length; k++) {
        if (prefixes[k].toLowerCase().charCodeAt(0) !== base + k) {
          sequenceValid = false
          break
        }
      }
    }

    if (!sequenceValid) {
      i = j
      continue
    }

    // Reject lists where any item's content is too long to be a choice.
    // Real choices are brief labels with optional descriptions; paragraph-length
    // items are explanatory content (insights, findings, design decisions).
    const anyItemTooLong = itemLines.some((line) => {
      const content = line.replace(/^(?:\d+|[a-zA-Z])[.)]\s+/, '')
      return content.length > MAX_ITEM_CONTENT_LENGTH
    })
    if (anyItemTooLong) {
      i = j
      continue
    }

    // Look for a question within 1–3 non-empty lines after the list.
    // The question must appear before any intervening non-question content;
    // if a non-blank, non-question line appears first the association is lost.
    // `j` is already pointing to the line right after the last item (or blank).
    let questionText: string | null = null
    let nonEmptyLinesScanned = 0
    let k = j

    while (k < lines.length && nonEmptyLinesScanned < 3) {
      const candidate = lines[k].trim()
      k++

      if (candidate === '') continue

      nonEmptyLinesScanned++

      if (candidate.includes('?')) {
        questionText = candidate
        break
      }

      // A non-blank line without a question means we hit unrelated content.
      // Stop scanning — the question (if any) is too far away.
      break
    }

    // Also check for a question in the preamble (before the list).
    // Walk backwards from the line before the first item, counting only
    // non-empty lines, and stop after 3 non-empty preamble lines scanned.
    // Additionally cap at MAX_PREAMBLE_LINE_DISTANCE absolute lines to
    // prevent associating semantically distant questions with the list.
    if (questionText === null) {
      let nonEmptyPreambleScanned = 0
      for (
        let p = i - 1;
        p >= 0 && p >= i - MAX_PREAMBLE_LINE_DISTANCE && nonEmptyPreambleScanned < 3;
        p--
      ) {
        const preamble = lines[p].trim()
        if (preamble === '') continue
        nonEmptyPreambleScanned++
        if (preamble.includes('?')) {
          questionText = preamble
          break
        }
      }
    }

    if (questionText === null || !isSelectionQuestion(questionText)) {
      i = j
      continue
    }

    // Check preamble for informational context (e.g. "you should see:",
    // "worth noting", "insight", etc.). If the text before the list describes
    // expected outcomes, observations, or commentary, the list is not a set of
    // choices even if a selection question is nearby. We scan up to 3 non-empty
    // preamble lines within the same distance cap used for question scanning,
    // so the informational check window is at least as wide as the question
    // scan window.
    let hasInformationalPreamble = false
    let nonEmptyPreambleLinesChecked = 0
    for (let p = i - 1; p >= 0 && p >= i - MAX_PREAMBLE_LINE_DISTANCE; p--) {
      const preamble = lines[p].trim()
      if (preamble === '') continue
      nonEmptyPreambleLinesChecked++
      if (isInformationalPreamble(preamble)) {
        hasInformationalPreamble = true
        break
      }
      if (nonEmptyPreambleLinesChecked >= 3) break
    }

    if (hasInformationalPreamble) {
      i = j
      continue
    }

    // Parse each item into label / description / rawText.
    const choices: DetectedChoice[] = itemLines.map((rawLine) => {
      // Strip the prefix (e.g. "1. " or "A) ") from the raw line.
      const content = rawLine.replace(/^(?:\d+|[a-zA-Z])[.)]\s+/, '')
      const { label, description } = parseItemContent(content)
      return { label, description, rawText: rawLine }
    })

    return { choices, questionText }
  }

  return null
}
