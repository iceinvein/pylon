import { useEffect } from 'react'
import { usePrReviewStore } from '../store/pr-review-store'

export function usePrReviewBridge() {
  const handleReviewUpdate = usePrReviewStore((s) => s.handleReviewUpdate)

  useEffect(() => {
    const unsub = window.api.onGhReviewUpdate((data) => {
      handleReviewUpdate(data as Parameters<typeof handleReviewUpdate>[0])
    })
    return unsub
  }, [handleReviewUpdate])

  // Subscribe to unseen PR count updates from background polling
  useEffect(() => {
    const unsub = window.api.onPrUnseenCount((data: { count: number }) => {
      usePrReviewStore.getState().setUnseenCount(data.count)
    })
    return unsub
  }, [])
}
