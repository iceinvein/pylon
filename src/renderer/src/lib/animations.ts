/** Shared animation variants for Framer Motion. */

type EaseQuart = [number, number, number, number]
const easeOutQuart: EaseQuart = [0.25, 1, 0.5, 1]

/** Stagger container — use on parent with `initial="hidden" animate="show"` */
export const stagger = (delay = 0.08) => ({
  hidden: {},
  show: { transition: { staggerChildren: delay } },
})

/** Fade + slide up — use on children as `variants={fadeUp}` */
export const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: easeOutQuart },
  },
}

/** Smaller fade-up for secondary content (prompt cards, inline reveals) */
export const fadeUpSmall = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: easeOutQuart },
  },
}
