import './LoadingState.css';

interface LoadingStateProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
  fullPage?: boolean;
}

/**
 * Consistent loading state component
 * Displays a spinner with optional message
 */
export default function LoadingState({
  message = 'Loading...',
  size = 'medium',
  fullPage = false
}: LoadingStateProps) {
  const containerClass = fullPage ? 'loading-state loading-state-fullpage' : 'loading-state';
  const spinnerClass = `loading-spinner loading-spinner-${size}`;

  return (
    <div className={containerClass}>
      <div className="loading-content">
        <div className={spinnerClass}>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
        {message && <p className="loading-message">{message}</p>}
      </div>
    </div>
  );
}

/**
 * Inline loading spinner for buttons or small areas
 */
export function InlineLoader({ size = 'small' }: { size?: 'small' | 'medium' }) {
  return (
    <span className={`inline-loader inline-loader-${size}`}>
      <span className="dot"></span>
      <span className="dot"></span>
      <span className="dot"></span>
    </span>
  );
}

/**
 * Loading overlay for specific sections
 */
export function LoadingOverlay({ message }: { message?: string }) {
  return (
    <div className="loading-overlay">
      <LoadingState message={message} size="large" />
    </div>
  );
}
