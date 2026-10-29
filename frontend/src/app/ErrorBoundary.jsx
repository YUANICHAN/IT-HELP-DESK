import { Component, Fragment } from 'react'
import Button from '../shared/components/Button.jsx'
import Card from '../shared/components/Card.jsx'

export default class ErrorBoundary extends Component {
  state = {
    hasError: false,
    recoveryKey: 0,
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  handleRecovery = () => {
    this.setState((state) => ({
      hasError: false,
      recoveryKey: state.recoveryKey + 1,
    }))
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center p-6">
          <Card className="w-full max-w-lg" role="alert">
            <p className="mb-2 text-meta font-bold tracking-[0.08em] text-primary-hover uppercase">
              Deskflow
            </p>
            <h1>Something went wrong</h1>
            <p className="mt-3 text-text-secondary">
              This page could not be displayed. Your error details were not
              exposed.
            </p>
            <Button className="mt-6" onClick={this.handleRecovery}>
              Try again
            </Button>
          </Card>
        </main>
      )
    }

    return (
      <Fragment key={this.state.recoveryKey}>{this.props.children}</Fragment>
    )
  }
}
