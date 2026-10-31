import { Component, type ComponentChildren } from 'preact';
import { paths } from '../paths';

interface State {
  error: Error | null;
}

/**
 * A rendering error on one screen must never lock the auditor out of the app: the data is still in the
 * database, so offer the way back to the list and a reload.
 */
export class ErrorBoundary extends Component<{ children: ComponentChildren }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error('screen failed to render', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main class="screen">
        <h1>Something went wrong on this screen</h1>
        <p class="muted">Your audits are still saved on this device. Go back to the list, or reload the app.</p>
        <p class="muted small">{this.state.error.message}</p>
        <div class="actions-row">
          <a
            href={paths.home()}
            class="btn btn-primary"
            onClick={() => {
              this.setState({ error: null });
            }}
          >
            Back to audits
          </a>
          <button type="button" class="btn" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </main>
    );
  }
}
