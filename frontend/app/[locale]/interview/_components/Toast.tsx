'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type ToastTone = 'success' | 'error' | 'info';
type ToastItem = { id: number; message: string; tone: ToastTone };
type ToastContextValue = { showToast: (message: string, tone?: ToastTone) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

const toneClass: Record<ToastTone, string> = {
  success: 'border-emerald-800/20 bg-emerald-50 text-emerald-900',
  error: 'border-red-800/25 bg-red-50 text-red-900',
  info: 'border-accent/20 bg-ivory-50 text-ink-900',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = ++nextId.current;
    setToasts((items) => [...items, { id, message, tone }]);
  }, []);

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((toast) =>
      window.setTimeout(
        () => setToasts((items) => items.filter((item) => item.id !== toast.id)),
        4200,
      ),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [toasts]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-20 z-[70] flex w-[min(92vw,24rem)] flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg ${toneClass[toast.tone]}`}
          >
            <div className="flex items-start justify-between gap-3">
              <p>{toast.message}</p>
              <button
                type="button"
                aria-label="Dismiss notification"
                className="shrink-0 font-semibold opacity-70 hover:opacity-100"
                onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useInterviewToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useInterviewToast must be used within ToastProvider');
  return context;
}
