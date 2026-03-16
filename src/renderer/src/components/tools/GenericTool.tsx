import { CollapsibleOutput } from './CollapsibleOutput'

type GenericToolProps = {
  input: Record<string, unknown>
  result?: string
}

export function GenericTool({ input, result }: GenericToolProps) {
  return (
    <div>
      <pre className="overflow-x-auto rounded bg-[var(--color-base-raised)] p-2 font-[family-name:var(--font-mono)] text-[var(--color-base-text)] text-xs">
        {JSON.stringify(input, null, 2)}
      </pre>
      {result && <CollapsibleOutput text={result} />}
    </div>
  )
}
