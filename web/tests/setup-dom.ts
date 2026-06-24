// Node >=25 ships a native localStorage/sessionStorage global that throws
// without --localstorage-file. Under happy-dom, window has working in-memory
// storage — but window.localStorage is the same poisoned native getter, so
// we install a self-contained MemoryStorage that never throws during evaluation.
// No-op in the 'node' environment (no window).
if (typeof window !== 'undefined') {
  class MemoryStorage {
    private m = new Map<string, string>()
    get length() { return this.m.size }
    clear() { this.m.clear() }
    getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
    key(i: number) { return [...this.m.keys()][i] ?? null }
    removeItem(k: string) { this.m.delete(k) }
    setItem(k: string, v: string) { this.m.set(k, String(v)) }
    [name: string]: unknown
  }
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    try {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        value: new MemoryStorage(),
      })
    } catch {
      // native global non-configurable on this runtime — bare localStorage
      // will still throw; use window[key] directly in tests if needed.
    }
  }
}
