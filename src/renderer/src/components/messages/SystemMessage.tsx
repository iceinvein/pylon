import { Info } from 'lucide-react'

type SystemMessageProps = {
  content: string
  subtype?: string
}

export function SystemMessage({ content, subtype }: SystemMessageProps) {
  return (
    <div className="flex items-start gap-2 px-4 py-1.5">
      <Info size={12} className="mt-0.5 flex-shrink-0 text-zinc-600" />
      <div className="min-w-0">
        {subtype && (
          <span className="mr-2 text-xs font-medium text-zinc-600">[{subtype}]</span>
        )}
        <span className="text-xs text-zinc-500">{content}</span>
      </div>
    </div>
  )
}
