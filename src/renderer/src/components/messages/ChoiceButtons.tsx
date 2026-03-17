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
    <div className="my-2 mr-6 ml-15 space-y-1.5">
      {choices.map((choice, i) => (
        <button
          type="button"
          key={i}
          onClick={(e) => handleClick(e, choice.label)}
          className="w-full rounded border border-base-border/60 bg-base-raised/30 px-3 py-2 text-left transition-colors hover:border-info/40 hover:bg-base-raised/50"
        >
          <span className="font-medium text-base-text text-sm">{choice.label}</span>
          {choice.description && (
            <p className="mt-0.5 text-base-text-muted text-xs">{choice.description}</p>
          )}
        </button>
      ))}
      <p className="text-[10px] text-base-text-faint">Click to send · Shift+click to edit first</p>
    </div>
  )
}
