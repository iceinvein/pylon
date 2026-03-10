import { MessageCircleQuestion } from 'lucide-react'

type QuestionOption = {
  label: string
  description: string
  preview?: string
}

type Question = {
  question: string
  header: string
  options: QuestionOption[]
  multiSelect?: boolean
}

type AskUserQuestionToolProps = {
  input: Record<string, unknown>
}

function parseQuestions(input: Record<string, unknown>): Question[] {
  const raw = input.questions
  if (!Array.isArray(raw)) return []
  return raw.map((q) => ({
    question: String(q?.question ?? ''),
    header: String(q?.header ?? ''),
    options: Array.isArray(q?.options)
      ? q.options.map((o: Record<string, unknown>) => ({
          label: String(o?.label ?? ''),
          description: String(o?.description ?? ''),
          preview: o?.preview ? String(o.preview) : undefined,
        }))
      : [],
    multiSelect: q?.multiSelect === true,
  }))
}

export function AskUserQuestionTool({ input }: AskUserQuestionToolProps) {
  const questions = parseQuestions(input)

  if (questions.length === 0) {
    return (
      <pre className="overflow-x-auto rounded bg-stone-800 p-2 font-mono text-stone-300 text-xs">
        {JSON.stringify(input, null, 2)}
      </pre>
    )
  }

  return (
    <div className="space-y-3">
      {questions.map((q, qi) => (
        <div key={qi}>
          <div className="flex items-start gap-2">
            <MessageCircleQuestion size={13} className="mt-0.5 flex-shrink-0 text-blue-400" />
            <div className="min-w-0 flex-1">
              {q.header && (
                <span className="mb-1 inline-block rounded-full bg-blue-900/40 px-2 py-0.5 font-medium text-[10px] text-blue-300 uppercase tracking-wide">
                  {q.header}
                </span>
              )}
              <p className="text-sm text-stone-200">{q.question}</p>
              <div className="mt-2 space-y-1.5">
                {q.options.map((opt, oi) => (
                  <div
                    key={oi}
                    className="rounded border border-stone-700/60 bg-stone-800/50 px-3 py-2 transition-colors"
                  >
                    <span className="font-medium text-sm text-stone-300">{opt.label}</span>
                    {opt.description && (
                      <p className="mt-0.5 text-stone-500 text-xs">{opt.description}</p>
                    )}
                  </div>
                ))}
              </div>
              {q.multiSelect && (
                <p className="mt-1.5 text-[10px] text-stone-600">Multiple selections allowed</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Extract a short summary for the collapsed tool use row */
export function getAskUserQuestionSummary(input: Record<string, unknown>): string {
  const questions = parseQuestions(input)
  if (questions.length === 0) return ''
  if (questions.length === 1) return questions[0].question.slice(0, 80)
  return `${questions.length} questions`
}
