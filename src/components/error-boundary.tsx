'use client';

import { Feedback } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Feedback tone='error' role='alert'>
          <p>The application could not render this view.</p>
          <Button variant='outline' onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </Feedback>
      );
    }

    return this.props.children;
  }
}
