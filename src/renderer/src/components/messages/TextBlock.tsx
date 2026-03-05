import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type TextBlockProps = {
  text: string
}

export function TextBlock({ text }: TextBlockProps) {
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-zinc-800 prose-pre:text-zinc-200 prose-code:text-zinc-300 prose-code:bg-zinc-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-headings:text-zinc-100 prose-p:text-zinc-200 prose-li:text-zinc-200 prose-strong:text-zinc-100 prose-a:text-blue-400">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}
