type GenericToolProps = {
  input: Record<string, unknown>
}

export function GenericTool({ input }: GenericToolProps) {
  return (
    <pre className="overflow-x-auto rounded bg-zinc-800 p-2 text-xs text-zinc-300">
      {JSON.stringify(input, null, 2)}
    </pre>
  )
}
