// Tiny toast store for the admin. Client-side only: components/admin/ui/Toaster
// subscribes to it and forms and actions call toast.success() and friends.

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

/** Newest toasts win when more than this many are queued. */
export const MAX_TOASTS = 4;

/** How long each kind stays. Errors stay longest so they can be read. */
export const TOAST_MS: Record<ToastKind, number> = {
  success: 4000,
  info: 5000,
  error: 8000,
};

export const NO_TOASTS: readonly ToastItem[] = [];

let items: readonly ToastItem[] = NO_TOASTS;
let lastId = 0;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function publish(next: readonly ToastItem[]) {
  items = next;
  for (const listener of listeners) listener();
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Stable between changes, as useSyncExternalStore requires. */
export function getToasts(): readonly ToastItem[] {
  return items;
}

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
  if (items.some((item) => item.id === id)) {
    publish(items.filter((item) => item.id !== id));
  }
}

/** `ms` of 0 keeps the toast until it is dismissed. */
export function showToast(kind: ToastKind, message: string, ms: number = TOAST_MS[kind]): number {
  const id = ++lastId;
  const next = [...items, { id, kind, message }];
  const dropped = next.slice(0, Math.max(0, next.length - MAX_TOASTS));
  for (const item of dropped) {
    const timer = timers.get(item.id);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(item.id);
  }
  publish(next.slice(-MAX_TOASTS));
  if (ms > 0) timers.set(id, setTimeout(() => dismissToast(id), ms));
  return id;
}

export const toast = {
  success: (message: string, ms?: number) => showToast("success", message, ms),
  error: (message: string, ms?: number) => showToast("error", message, ms),
  info: (message: string, ms?: number) => showToast("info", message, ms),
};

/** Test helper: clears every toast and timer. */
export function resetToasts(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  publish(NO_TOASTS);
}
