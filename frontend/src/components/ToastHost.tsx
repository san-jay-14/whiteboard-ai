import { useSyncExternalStore } from 'react';
import { dismissToast, getToastsSnapshot, subscribeToasts } from '../lib/toast';

// Rendered once at the App root (outside the list/board conditional) so
// errors surface regardless of which screen is active.
export default function ToastHost() {
  const toasts = useSyncExternalStore(subscribeToasts, getToastsSnapshot);
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          {t.message}
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            className="text-neutral-400 hover:text-white"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
