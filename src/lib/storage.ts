// Browsers may disable storage in private contexts. Preferences are optional.
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
export function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* Keep the current in-memory preference. */
  }
}
