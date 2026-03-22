/**
 * Provider system — public API.
 *
 * Import from here in SessionManager and IPC handlers.
 * Never import individual provider files from outside this directory.
 */

export { ClaudeProvider } from './claude-provider'
export { CodexProvider } from './codex-provider'
export {
  getAllModels,
  getProvider,
  getProviderForModel,
  getProviderIds,
  hasProvider,
  initModelDiscovery,
  refreshModels,
  registerProvider,
} from './registry'
export type {
  AgentProvider,
  AgentSession,
  NormalizedEvent,
  ProviderCapabilities,
  ProviderId,
  ProviderModel,
  ProviderSessionConfig,
} from './types'
