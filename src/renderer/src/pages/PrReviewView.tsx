import { useEffect } from 'react'
import { usePrReviewStore } from '../store/pr-review-store'
import { PrList } from '../components/pr-review/PrList'
import { PrDetail } from '../components/pr-review/PrDetail'
import { GhSetupGuide } from '../components/pr-review/GhSetupGuide'

export function PrReviewView() {
  const { ghStatus, checkGhStatus } = usePrReviewStore()

  useEffect(() => {
    checkGhStatus()
  }, [])

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
