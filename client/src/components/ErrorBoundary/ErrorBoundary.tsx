import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = {
        hasError: false,
    };

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("Application error:", error, info);
    }

    render() {
        if (this.state.hasError) {
            return (<main style={{
                    minHeight: "60vh",
                    display: "grid",
                    placeItems: "center",
                    padding: "2rem",
                    textAlign: "center",
                }}>
          <div>
            <h1>Something went wrong</h1>
            <p>Please refresh the page and try again.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Refresh
            </button>
          </div>
        </main>);
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
