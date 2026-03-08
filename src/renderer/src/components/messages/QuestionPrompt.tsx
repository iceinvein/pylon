import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageCircleQuestion } from 'lucide-react'
import type { QuestionRequest, QuestionItem } from '../../../../shared/types'

type QuestionPromptProps = {
  question: QuestionRequest
  onRespond: (requestId: string, answers: Record<string, string>) => void
}

const CONFIRM_PATTERN = /\b(sound good|look good|look right|look correct|proceed|continue|go ahead|approve|confirm|ready|agree|acceptable|make sense|right track|good to go|shall i|should i|want me to|okay with|fine with|satisfied)\b/i

function getDefaultAnswer(q: QuestionItem): string {
  if (q.options.length > 0) return ''
  if (CONFIRM_PATTERN.test(q.question)) return 'yes'
  return ''
}

export function QuestionPrompt({ question, onRespond }: QuestionPromptProps) {
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const q of question.questions) {
      const def = getDefaultAnswer(q)
      if (def) initial[q.question] = def
    }
    return initial
  })
  const [submitted, setSubmitted] = useState(false)
  const [focusedOption, setFocusedOption] = useState<Record<string, number>>({})

  function toggleOption(questionText: string, label: string, multiSelect: boolean) {
    setSelections((prev) => {
      const current = prev[questionText] ?? []
      if (multiSelect) {
        const next = current.includes(label)
          ? current.filter((l) => l !== label)
          : [...current, label]
        return { ...prev, [questionText]: next }
      }
      return { ...prev, [questionText]: [label] }
    })
  }

  function buildAnswers(): Record<string, string> {
    const answers: Record<string, string> = {}
    for (const q of question.questions) {
      if (q.options.length === 0) {
        answers[q.question] = textAnswers[q.question] ?? ''
      } else {
        const selected = selections[q.question] ?? []
        answers[q.question] = selected.join(', ')
      }
    }
    return answers
  }

  function handleSubmit() {
    setSubmitted(true)
    onRespond(question.requestId, buildAnswers())
  }

  // Auto-submit for single-question, single-select when an option is clicked
  function handleOptionClick(questionText: string, label: string, multiSelect: boolean) {
    if (submitted) return
    toggleOption(questionText, label, multiSelect)

    if (!multiSelect && question.questions.length === 1) {
      const answers: Record<string, string> = { [questionText]: label }
      setSubmitted(true)
      onRespond(question.requestId, answers)
    }
  }

  const hasTextQuestions = question.questions.some((q) => q.options.length === 0)
  const allAnswered = question.questions.every((q) => {
    if (q.options.length === 0) return (textAnswers[q.question] ?? '').trim().length > 0
    return (selections[q.question] ?? []).length > 0
  })
  const needsExplicitSubmit = question.questions.length > 1 || question.questions.some((q) => q.multiSelect) || hasTextQuestions

  return (
    <div className="mx-6 my-2 rounded-lg border border-blue-800/40 bg-blue-950/15 p-4">
      <div className="space-y-4">
        {question.questions.map((q, qi) => (
          <div key={qi} className="flex items-start gap-3">
            <MessageCircleQuestion size={16} className="mt-0.5 flex-shrink-0 text-blue-400" />
            <div className="min-w-0 flex-1">
              {q.header && (
                <span className="mb-1.5 inline-block rounded-full bg-blue-900/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-300">
                  {q.header}
                </span>
              )}
              <p className="text-sm text-stone-200">{q.question}</p>
              {q.options.length > 0 ? (
                <div className="mt-2 space-y-1.5">
                  {q.options.map((opt, oi) => {
                    const isSelected = (selections[q.question] ?? []).includes(opt.label)
                    return (
                      <button
                        key={oi}
                        disabled={submitted}
                        onClick={() => handleOptionClick(q.question, opt.label, q.multiSelect ?? false)}
                        onMouseEnter={() => setFocusedOption((prev) => ({ ...prev, [q.question]: oi }))}
                        className={`w-full rounded border px-3 py-2 text-left transition-colors ${
                          submitted
                            ? isSelected
                              ? 'border-blue-600/60 bg-blue-900/30'
                              : 'border-stone-800/40 bg-stone-900/20 opacity-50'
                            : isSelected
                              ? 'border-blue-500/60 bg-blue-900/30'
                              : 'border-stone-700/60 bg-stone-800/30 hover:border-blue-600/40 hover:bg-stone-800/50'
                        }`}
                      >
                        <span className={`text-sm font-medium ${isSelected ? 'text-blue-200' : 'text-stone-300'}`}>
                          {opt.label}
                        </span>
                        {opt.description && (
                          <p className="mt-0.5 text-xs text-stone-500">{opt.description}</p>
                        )}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <TextInput
                  value={textAnswers[q.question] ?? ''}
                  onChange={(val) => setTextAnswers((prev) => ({ ...prev, [q.question]: val }))}
                  onSubmit={handleSubmit}
                  disabled={submitted}
                  autoFocus={qi === 0 || (qi === question.questions.findIndex((qq) => qq.options.length === 0))}
                  prefilled={!!getDefaultAnswer(q)}
                />
              )}
              {/* Preview panel — auto-height with crossfade on content change */}
              {q.options.some((o) => o.preview) && (() => {
                const focusedIdx = focusedOption[q.question]
                const raw = focusedIdx !== undefined ? q.options[focusedIdx]?.preview : undefined
                const cleaned = raw
                  ? raw.replace(/^```\w*\n?/gm, '').replace(/```\s*$/gm, '').trim()
                  : null
                return (
                  <div className="mt-2 rounded border border-stone-700/50 bg-stone-900/60 px-3 py-2 transition-all duration-150 ease-out">
                    <div key={focusedIdx ?? 'empty'} className="animate-[fadeIn_150ms_ease-out]">
                      {cleaned ? (
                        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-[family-name:var(--font-mono)] text-xs leading-relaxed text-stone-300">
                          {cleaned}
                        </pre>
                      ) : (
                        <p className="py-0.5 text-[11px] italic text-stone-600">
                          Hover an option to see its preview
                        </p>
                      )}
                    </div>
                  </div>
                )
              })()}
              {q.multiSelect && !submitted && (
                <p className="mt-1.5 text-[10px] text-stone-600">Select multiple options</p>
              )}
            </div>
          </div>
        ))}

        {/* Show explicit submit button for multi-select, multi-question, or text inputs */}
        {!submitted && needsExplicitSubmit && (
          <div className="flex justify-end pt-1">
            <button
              disabled={!allAnswered}
              onClick={handleSubmit}
              className="rounded-md bg-blue-700 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-40 disabled:hover:bg-blue-700"
            >
              Submit
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function TextInput({
  value,
  onChange,
  onSubmit,
  disabled,
  autoFocus,
  prefilled,
}: {
  value: string
  onChange: (val: string) => void
  onSubmit: () => void
  disabled: boolean
  autoFocus: boolean
  prefilled: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!autoFocus || !inputRef.current) return
    inputRef.current.focus()
    if (prefilled) {
      inputRef.current.select()
    }
  }, [autoFocus, prefilled])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && value.trim()) {
        e.preventDefault()
        onSubmit()
      }
    },
    [onSubmit, value]
  )

  return (
    <div className="mt-2">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Type your answer..."
        className="w-full rounded border border-stone-700/60 bg-stone-800/30 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-blue-500/60 focus:outline-none disabled:opacity-50"
      />
    </div>
  )
}
