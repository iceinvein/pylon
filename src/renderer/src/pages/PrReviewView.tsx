import { useEffect } from 'react'
import { GhSetupGuide } from '../components/pr-review/GhSetupGuide'
import { PrDetail } from '../components/pr-review/PrDetail'
import { PrList } from '../components/pr-review/PrList'
import { usePrReviewStore } from '../store/pr-review-store'

export function PrReviewView() {
  const { ghStatus, checkGhStatus } = usePrReviewStore()

  useEffect(() => {
    checkGhStatus()
  }, [checkGhStatus])

  const isReady = ghStatus?.available && ghStatus?.authenticated

  return (
    <div className="flex h-full">
      {isReady ? (
        <>
          <div className="w-[280px] flex-shrink-0">
            <PrList />
          </div>
          <div className="min-w-0 flex-1">
            <PrDetail />
          </div>
        </>
      ) : (
        <div className="min-w-0 flex-1">
          <GhSetupGuide />
        </div>
      )}
    </div>
  )
}
