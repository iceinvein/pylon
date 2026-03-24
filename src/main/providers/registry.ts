/**
 * Provider registry — maps provider IDs to their implementations.
 *
 * Providers are registered at app startup. The SessionManager and IPC
 * handlers look up providers by ID or by model ID to delegate work.
 *
 * Model discovery:
 *   Static catalog → immediate, always available (fallback).
 *   SQLite cache   → persisted across restarts, returned if fresh.
 *   Live discovery → background refresh via provider.discoverModels().
 */

import { log } from '../../shared/logger'
import { getDb } from '../db'
import type { AgentProvider, ProviderId, ProviderModel } from './types'

const logger = log.child('provider-registry')

const providers = new Map<ProviderId, AgentProvider>()

// ── In-memory model cache ────────────────────────
// Populated from SQLite on first read, refreshed in background.

let cachedModels: ProviderModel[] | null = null
let cacheTimestamp = 0

/** How long (ms) before cached models are considered stale and refreshed */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export function registerProvider(provider: AgentProvider): void {
  providers.set(provider.id, provider)
}

export function getProvider(id: ProviderId): AgentProvider {
  const provider = providers.get(id)
  if (!provider) {
    throw new Error(`Unknown provider: ${id}. Available: ${[...providers.keys()].join(', ')}`)
  }
  return provider
}

/** Find which provider owns a given model ID — checks cache first, then static */
export function getProviderForModel(modelId: string): AgentProvider | undefined {
  // Check cached/discovered models first
  if (cachedModels) {
    const cached = cachedModels.find((m) => m.id === modelId)
    if (cached) {
      return providers.get(cached.provider)
    }
  }
  // Fall back to static catalogs
  for (const provider of providers.values()) {
    if (provider.models.some((m) => m.id === modelId)) {
      return provider
    }
  }
  return undefined
}

/**
 * Get all models — returns discovered models from cache if available,
 * otherwise falls back to static catalogs.
 */
export function getAllModels(): ProviderModel[] {
  if (cachedModels && cachedModels.length > 0) {
    return cachedModels
  }
  return [...providers.values()].flatMap((p) => p.models)
}

/** Get all registered provider IDs */
export function getProviderIds(): ProviderId[] {
  return [...providers.keys()]
}

/** Check if a provider is registered */
export function hasProvider(id: ProviderId): boolean {
  return providers.has(id)
}

// ── Model Discovery & Cache ─────────────────────

/** Load cached models from SQLite. Call once at startup. */
export function loadCachedModels(): void {
  try {
    const db = getDb()
    const row = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('provider_models_cache') as { value: string } | undefined
    const tsRow = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('provider_models_cache_ts') as { value: string } | undefined
    if (row && tsRow) {
      cachedModels = JSON.parse(row.value) as ProviderModel[]
      cacheTimestamp = Number(tsRow.value)
      const ageMin = Math.round((Date.now() - cacheTimestamp) / 60_000)
      logger.info(`Loaded ${cachedModels.length} cached models (age: ${ageMin}m)`)
    }
  } catch {
    // No cache yet — fine, static fallback works
  }
}

/** Persist discovered models to SQLite */
function saveCachedModels(models: ProviderModel[]): void {
  try {
    const db = getDb()
    const now = Date.now()
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'provider_models_cache',
      JSON.stringify(models),
    )
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'provider_models_cache_ts',
      String(now),
    )
    cachedModels = models
    cacheTimestamp = now
  } catch (err) {
    logger.error('Failed to save model cache:', err)
  }
}

/** Whether the cache is stale and should be refreshed */
export function isCacheStale(): boolean {
  return Date.now() - cacheTimestamp > CACHE_TTL_MS
}

/**
 * Refresh models from all providers that support discovery.
 * Calls discoverModels() on each provider, merges results with
 * static catalogs (for providers without discovery), and persists.
 */
export async function refreshModels(): Promise<ProviderModel[]> {
  const allModels: ProviderModel[] = []

  for (const provider of providers.values()) {
    if (provider.discoverModels) {
      try {
        logger.info(`Discovering models for ${provider.id}...`)
        const discovered = await provider.discoverModels()
        logger.info(`Discovered ${discovered.length} models for ${provider.id}`)
        allModels.push(...discovered)
      } catch (err) {
        logger.error(`Discovery failed for ${provider.id}, using static catalog:`, err)
        allModels.push(...provider.models)
      }
    } else {
      // Provider doesn't support discovery — use static catalog
      allModels.push(...provider.models)
    }
  }

  saveCachedModels(allModels)
  return allModels
}

/**
 * Startup routine: load cache from SQLite, then kick off background
 * refresh if stale. Returns immediately with cached or static models.
 */
export async function initModelDiscovery(): Promise<void> {
  loadCachedModels()
  if (isCacheStale()) {
    // Refresh in background — don't block startup
    refreshModels().catch((err) => {
      logger.error('Background model refresh failed:', err)
    })
  }
}
