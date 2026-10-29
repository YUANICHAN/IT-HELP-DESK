import { Component, Fragment } from 'react'

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
        <main className="feedback-page">
          <section className="feedback-card" role="alert">
            <p className="eyebrow">Deskflow</p>
            <h1>Something went wrong</h1>
            <p>
              This page could not be displayed. Your error details were not
              exposed.
            </p>
            <button className="primary-action" onClick={this.handleRecovery} type="button">
              Try again
            </button>
          </section>
        </main>
      )
    }

    return (
      <Fragment key={this.state.recoveryKey}>{this.props.children}</Fragment>
    )
  }
}
