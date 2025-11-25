import { useState, useEffect, useCallback, useRef } from "react";

// Web URL is hardcoded at build time via environment variable
export const WEB_URL =
  import.meta.env.VITE_VPNVPN_DESKTOP_URL ??
  "http://localhost:3000/desktop?desktop=1";

// API URL for health checks (derived from web URL or separate env var)
const API_URL =
  import.meta.env.VITE_VPNVPN_API_URL ??
  import.meta.env.VITE_VPNVPN_DESKTOP_URL?.replace("/desktop?desktop=1", "") ??
  "http://localhost:3000";

type ConnectionState = "loading" | "connected" | "error" | "offline";

interface ErrorInfo {
  message: string;
  details?: string;
}

export default function App() {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("loading");
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadTimeoutRef = useRef<number | null>(null);

  // Check if we're online
  const checkOnline = useCallback(() => {
    return navigator.onLine;
  }, []);

  // Check if the server is reachable
  const checkServerHealth = useCallback(async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${API_URL}/api/health`, {
        method: "HEAD",
        mode: "no-cors",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Handle iframe load success
  const handleIframeLoad = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    setConnectionState("connected");
    setError(null);
    setRetryCount(0);
  }, []);

  // Handle iframe load error
  const handleIframeError = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }

    if (!checkOnline()) {
      setConnectionState("offline");
      setError({
        message: "No internet connection",
        details: "Please check your network connection and try again.",
      });
    } else {
      setConnectionState("error");
      setError({
        message: "Unable to connect to vpnVPN",
        details: `Could not reach ${WEB_URL}. The server may be down or unreachable.`,
      });
    }
  }, [checkOnline]);

  // Start loading with timeout
  const startLoading = useCallback(() => {
    setConnectionState("loading");
    setError(null);

    // Set a timeout for loading
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }

    loadTimeoutRef.current = window.setTimeout(() => {
      // If still loading after timeout, check if it's a connection issue
      if (connectionState === "loading") {
        handleIframeError();
      }
    }, 15000); // 15 second timeout
  }, [connectionState, handleIframeError]);

  // Retry connection
  const handleRetry = useCallback(async () => {
    setRetryCount((prev) => prev + 1);
    startLoading();

    // Force iframe reload
    if (iframeRef.current) {
      const currentSrc = iframeRef.current.src;
      iframeRef.current.src = "";
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = currentSrc;
        }
      }, 100);
    }
  }, [startLoading]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      if (connectionState === "offline") {
        handleRetry();
      }
    };

    const handleOffline = () => {
      setConnectionState("offline");
      setError({
        message: "Connection lost",
        details: "Your internet connection was lost. Waiting to reconnect...",
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [connectionState, handleRetry]);

  // Initial load
  useEffect(() => {
    startLoading();

    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, []);

  // Render loading state
  if (connectionState === "loading") {
    return (
      <div className="app-container">
        <div className="status-screen">
          <div className="logo">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h1>vpnVPN</h1>
          <div className="loading-spinner" />
          <p className="loading-text">Connecting to vpnVPN...</p>
          <p className="loading-url">{WEB_URL}</p>
        </div>
      </div>
    );
  }

  // Render error/offline state
  if (connectionState === "error" || connectionState === "offline") {
    return (
      <div className="app-container">
        <div className="status-screen error">
          <div className="logo error-icon">
            {connectionState === "offline" ? (
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
                <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" />
              </svg>
            ) : (
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
          </div>
          <h1>{error?.message ?? "Connection Error"}</h1>
          <p className="error-details">{error?.details}</p>

          <div className="error-actions">
            <button
              type="button"
              className="retry-button"
              onClick={handleRetry}
            >
              {retryCount > 0 ? `Retry (${retryCount})` : "Retry"}
            </button>
          </div>

          <div className="error-info">
            <p>Server URL: {WEB_URL}</p>
            <p>
              Status:{" "}
              {connectionState === "offline" ? "Offline" : "Unreachable"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Render connected state with iframe
  return (
    <div className="app-container">
      <iframe
        ref={iframeRef}
        src={WEB_URL}
        title="vpnVPN Desktop"
        className="app-iframe"
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        allow="clipboard-write; fullscreen"
      />
    </div>
  );
}
