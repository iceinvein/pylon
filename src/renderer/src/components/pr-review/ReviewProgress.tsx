import { Loader2, StopCircle } from 'lucide-react'

type Props = {
  reviewId: string
  onStop: () => void
}

export function ReviewProgress({ reviewId: _reviewId, onStop }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <Loader2 size={24} className="animate-spin text-stone-400" />
      <div className="text-center">
        <p className="text-sm text-stone-300">Reviewing PR...</p>
        <p className="mt-1 text-xs text-stone-500">Claude is analyzing the diff and producing findings</p>
      </div>
      <button
        onClick={onStop}
        className="flex items-center gap-1.5 rounded-lg border border-stone-700 px-3 py-1.5 text-xs text-stone-400 transition-colors hover:border-stone-600 hover:text-stone-300"
      >
        <StopCircle size={12} />
        Stop Review
      </button>
    </div>
  )
}
