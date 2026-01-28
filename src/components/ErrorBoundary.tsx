import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.state.error?.message || "An unexpected error occurred";
      const isFirebaseError = errorMessage.includes("FIREBASE") || errorMessage.includes("Firebase");

      return (
        <div
          style={{
            padding: "var(--spacing-5)",
            color: "var(--error)",
            backgroundColor: "var(--app-bg-color)",
            minHeight: "calc(100vh - 51px)",
          }}
        >
          <h2 style={{ color: "var(--error)", marginBottom: "var(--spacing-3)" }}>
            {isFirebaseError ? "Firebase Configuration Error" : "Error"}
          </h2>
          <p style={{ marginBottom: "var(--spacing-3)", color: "var(--app-text-color)" }}>
            {isFirebaseError
              ? "There was an error with your Firebase configuration. Please check your settings."
              : errorMessage}
          </p>
          {isFirebaseError && (
            <p style={{ marginBottom: "var(--spacing-3)", color: "var(--app-text-color-secondary)", fontSize: "0.9rem" }}>
              Please go to <strong>Settings → Live Testimonies</strong> to configure Firebase properly.
              <br />
              Your databaseURL should be in the format: <code>https://&lt;YOUR-FIREBASE&gt;.firebaseio.com</code>
            </p>
          )}
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="primary"
            style={{ marginTop: "var(--spacing-3)" }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
