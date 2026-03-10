import type { DetectedChoice } from '../../lib/detect-choices'

type ChoiceButtonsProps = {
  choices: DetectedChoice[]
  onSelect: (text: string) => void
  onPreFill: (text: string) => void
}

export function ChoiceButtons({ choices, onSelect, onPreFill }: ChoiceButtonsProps) {
  function handleClick(e: React.MouseEvent<HTMLButtonElement>, label: string) {
    if (e.shiftKey) {
      onPreFill(label)
    } else {
      onSelect(label)
    }
  }

  return (
    <div className="mx-6 my-2 space-y-1.5">
      {choices.map((choice, i) => (
        <button
          type="button"
          key={i}
          onClick={(e) => handleClick(e, choice.label)}
          className="w-full rounded border border-stone-700/60 bg-stone-800/30 px-3 py-2 text-left transition-colors hover:border-blue-600/40 hover:bg-stone-800/50"
        >
          <span className="font-medium text-sm text-stone-300">{choice.label}</span>
          {choice.description && (
            <p className="mt-0.5 text-stone-500 text-xs">{choice.description}</p>
          )}
        </button>
      ))}
      <p className="text-[10px] text-stone-600">Click to send · Shift+click to edit first</p>
    </div>
  )
}
