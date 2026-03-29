import { create } from 'zustand'
import type { SetupCompleteEvent, SetupProgressEvent, WorktreeRecipe } from '../../../shared/types'

type SetupPhase =
  | 'idle'
  | 'analyzing'
  | 'confirming'
  | 'executing'
  | 'complete'

type WorktreeSetupState = {
  phase: SetupPhase
  sessionId: string | null
  recipe: WorktreeRecipe | null
  progress: SetupProgressEvent | null
  result: SetupCompleteEvent | null
  error: string | null

  startAnalyzing: (sessionId: string) => void
  setRecipe: (recipe: WorktreeRecipe) => void
  startConfirming: () => void
  startExecuting: () => void
  setProgress: (progress: SetupProgressEvent) => void
  setResult: (result: SetupCompleteEvent) => void
  setError: (error: string) => void
  reset: () => void
}

export const useWorktreeSetupStore = create<WorktreeSetupState>((set) => ({
  phase: 'idle',
  sessionId: null,
  recipe: null,
  progress: null,
  result: null,
  error: null,

  startAnalyzing: (sessionId) => set({ phase: 'analyzing', sessionId, recipe: null, progress: null, result: null, error: null }),
  setRecipe: (recipe) => set({ recipe }),
  startConfirming: () => set({ phase: 'confirming' }),
  startExecuting: () => set({ phase: 'executing', progress: null, result: null }),
  setProgress: (progress) => set({ progress }),
  setResult: (result) => set({ phase: 'complete', result }),
  setError: (error) => set({ phase: 'complete', error }),
  reset: () => set({ phase: 'idle', sessionId: null, recipe: null, progress: null, result: null, error: null }),
}))
