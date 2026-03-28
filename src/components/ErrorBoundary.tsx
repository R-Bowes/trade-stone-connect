import React from "react";
import { ErrorState } from "@/components/AsyncState";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    message: "An unexpected error occurred.",
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || "An unexpected error occurred.",
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Unhandled UI error", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: "An unexpected error occurred." });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorState message={this.state.message} onRetry={this.handleRetry} retryLabel="Try again" />;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
