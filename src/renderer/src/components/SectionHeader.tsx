type SectionHeaderProps = {
  children: React.ReactNode
}

/** Tiny uppercase label for section dividers (Projects, Recent, History, etc.) */
export function SectionHeader({ children }: SectionHeaderProps) {
  return (
    <p className="mb-3 text-[11px] text-[var(--color-base-text-faint)] uppercase tracking-[0.15em]">
      {children}
    </p>
  )
}
