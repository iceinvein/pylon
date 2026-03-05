type GenericToolProps = {
  input: Record<string, unknown>
}

export function GenericTool({ input }: GenericToolProps) {
  return (
    <pre className="overflow-x-auto rounded bg-stone-800 p-2 font-[family-name:var(--font-mono)] text-xs text-stone-300">
      {JSON.stringify(input, null, 2)}
    </pre>
  )
}
