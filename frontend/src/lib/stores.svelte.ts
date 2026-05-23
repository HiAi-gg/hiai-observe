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
