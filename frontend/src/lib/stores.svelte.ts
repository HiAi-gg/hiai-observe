function createLocalStorage<T>(key: string, initial: T) {
  let value = $state<T>(initial);

  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      try {
        value = JSON.parse(stored) as T;
      } catch {
        value = initial;
      }
    }
  }

  return {
    get current() {
      return value;
    },
    set current(v: T) {
      value = v;
      if (typeof window !== "undefined") {
        localStorage.setItem(key, JSON.stringify(v));
      }
    },
  };
}

export const darkMode = createLocalStorage("hiai-observe-dark-mode", true);
export const apiKey = createLocalStorage("hiai-observe-api-key", "");
export const sidebarOpen = createLocalStorage("hiai-observe-sidebar-open", true);
export const currentProject = createLocalStorage<string>("hiai-observe-current-project", "");

// Toast notification system
interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

let toastId = 0;
let toasts = $state<ToastItem[]>([]);

export function showToast(message: string, type: "success" | "error" | "info" = "info") {
  const id = ++toastId;
  toasts = [...toasts, { id, message, type }];
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
  }, 3000);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
}

export function getToasts() {
  return toasts;
}
