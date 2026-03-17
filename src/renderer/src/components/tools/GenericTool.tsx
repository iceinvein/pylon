import { CollapsibleOutput } from './CollapsibleOutput'

type GenericToolProps = {
  input: Record<string, unknown>
  result?: string
}

export function GenericTool({ input, result }: GenericToolProps) {
  return (
    <div>
      <pre className="overflow-x-auto rounded bg-base-raised p-2 font-mono text-base-text text-xs">
        {JSON.stringify(input, null, 2)}
      </pre>
      {result && <CollapsibleOutput text={result} />}
    </div>
  )
}
