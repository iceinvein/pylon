import type { ErrorInfo, ReactNode } from 'react'
import { Component } from 'react'
import { log } from '../../../shared/logger'

const logger = log.child('error-boundary')

type Props = { children: ReactNode }
type State = { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('React error boundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-stone-950 text-stone-300">
          <div className="max-w-md space-y-4 text-center">
            <h1 className="font-medium text-lg text-stone-100">Something went wrong</h1>
            <p className="text-sm text-stone-500">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-stone-800 px-4 py-2 text-sm text-stone-200 transition-colors hover:bg-stone-700"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
