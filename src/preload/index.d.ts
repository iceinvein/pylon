type API = Record<string, never>

declare global {
  interface Window {
    api: API
  }
}
