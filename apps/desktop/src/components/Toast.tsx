import { useEffect, useState } from "react";
import { X, AlertCircle, CheckCircle, Info } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export type ToastMessage = {
  id: string;
  type: ToastType;
  message: string;
  duration?: number; // ms, 0 = persistent
};

type ToastProps = {
  toast: ToastMessage;
  onClose: (id: string) => void;
};

function Toast({ toast, onClose }: ToastProps) {
  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        onClose(toast.id);
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onClose]);

  const icons = {
    success: <CheckCircle className="h-5 w-5 text-emerald-400" />,
    error: <AlertCircle className="h-5 w-5 text-red-400" />,
    warning: <AlertCircle className="h-5 w-5 text-yellow-400" />,
    info: <Info className="h-5 w-5 text-blue-400" />,
  };

  const colors = {
    success: "border-emerald-500/30 bg-emerald-500/10",
    error: "border-red-500/30 bg-red-500/10",
    warning: "border-yellow-500/30 bg-yellow-500/10",
    info: "border-blue-500/30 bg-blue-500/10",
  };

  const textColors = {
    success: "text-emerald-300",
    error: "text-red-300",
    warning: "text-yellow-300",
    info: "text-blue-300",
  };

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border ${colors[toast.type]} px-4 py-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-top-2 fade-in duration-200`}
    >
      {icons[toast.type]}
      <p className={`flex-1 text-sm ${textColors[toast.type]}`}>
        {toast.message}
      </p>
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        className="text-slate-400 transition-colors hover:text-slate-200"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

type ToastContainerProps = {
  toasts: ToastMessage[];
  onClose: (id: string) => void;
};

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
}

// Hook for managing toasts
export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (
    type: ToastType,
    message: string,
    duration: number = 5000
  ) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToasts((prev) => [...prev, { id, type, message, duration }]);
    return id;
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const clearToasts = () => {
    setToasts([]);
  };

  return {
    toasts,
    addToast,
    removeToast,
    clearToasts,
    success: (message: string, duration?: number) =>
      addToast("success", message, duration),
    error: (message: string, duration?: number) =>
      addToast("error", message, duration ?? 0), // Errors persist by default
    warning: (message: string, duration?: number) =>
      addToast("warning", message, duration),
    info: (message: string, duration?: number) =>
      addToast("info", message, duration),
  };
}

