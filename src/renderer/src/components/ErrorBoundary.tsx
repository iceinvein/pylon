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
        <div className="flex h-screen w-screen items-center justify-center bg-base-bg text-base-text-secondary">
          <div className="max-w-md space-y-4 text-center">
            <h1 className="font-medium text-base-text text-lg">Pylon hit an unexpected error</h1>
            <p className="max-h-24 overflow-auto text-base-text-muted text-sm">
              {this.state.error?.message ??
                'Try reloading — if it persists, check the dev console.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-base-raised px-4 py-2 text-base-text text-sm transition-colors hover:brightness-110"
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
