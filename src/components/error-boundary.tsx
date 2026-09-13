"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Contains render failures and displays a caller fallback or reload action.
 */
export class ErrorBoundary extends Component<Props, State> {
  /**
   * Creates a boundary with its initial healthy render state.
   *
   * @param props - Child content and optional fallback.
   */
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  /**
   * Converts a render failure into boundary state for the fallback render.
   *
   * @param error - Error raised during rendering.
   * @returns The failed boundary state.
   */
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  /**
   * Logs the captured render failure and component stack.
   *
   * @param error - Error raised during rendering.
   * @param errorInfo - React component stack information.
   */
  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  /**
   * Renders the caller fallback or the shared reload feedback surface after failure.
   *
   * @returns The fallback, reload feedback, or child content.
   */
  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Feedback tone="error" role="alert">
          <p>The application could not render this view.</p>
          <Button
            variant="outline"
            onClick={() => {
              window.location.reload();
            }}
          >
            Reload page
          </Button>
        </Feedback>
      );
    }

    return this.props.children;
  }
}
