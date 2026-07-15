import { Component, type ErrorInfo, type ReactNode } from 'react'
import './ErrorBoundary.css'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches render-phase errors from a bad synced reading (e.g. two devices
 * both assigning the same station_sequence before either had seen the
 * other's data — see src/lib/sync/widthReadingsSync.ts) so one malformed
 * row can't blank the whole screen for a crew member in the field. Shows a
 * recoverable message instead of the default React unmount-to-blank
 * behavior; does not attempt to fix the underlying data.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <p className="error-boundary-title">Something went wrong loading this screen.</p>
          <p className="error-boundary-detail">{this.state.error.message}</p>
          <div className="error-boundary-actions">
            <button type="button" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <a href="/home">Go to Home</a>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
