// Minimal global toast store (step 12 polish pass) — no external dependency,
// mirrors the same subscribe/getSnapshot pattern already used for presence
// and connection status so ToastHost can read it via useSyncExternalStore.
export type Toast = { id: string; message: string };

let toasts: Toast[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function dismissToast(id: string): void {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

export function showErrorToast(message: string): void {
  const id = crypto.randomUUID();
  toasts = [...toasts, { id, message }];
  notify();
  setTimeout(() => dismissToast(id), 5000);
}

export function subscribeToasts(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getToastsSnapshot(): Toast[] {
  return toasts;
}
