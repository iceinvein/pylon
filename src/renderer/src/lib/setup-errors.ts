export function isClaudeSetupError(message?: string | null): boolean {
  if (!message) return false
  const normalized = message.toLowerCase()
  return normalized.includes('claude code cli not found')
}
