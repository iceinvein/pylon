import { CollapsibleOutput } from './CollapsibleOutput'

type GenericToolProps = {
  input: Record<string, unknown>
  result?: string
}

export function GenericTool({ input, result }: GenericToolProps) {
  return (
    <div>
      <pre className="overflow-x-auto rounded bg-stone-800 p-2 font-[family-name:var(--font-mono)] text-stone-300 text-xs">
        {JSON.stringify(input, null, 2)}
      </pre>
      {result && <CollapsibleOutput text={result} />}
    </div>
  )
}
