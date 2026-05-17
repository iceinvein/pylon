import { isEffortLevel } from '../shared/types'
import type { ProviderModel } from './providers/types'

const EFFORT_SETTING_KEYS = new Set(['defaultEffort', 'testingAgentEffort', 'astAgentEffort'])
const MODEL_SETTING_KEYS = new Set(['defaultModel', 'testingAgentModel', 'astAgentModel'])

export function isValidSettingValue(
  key: string,
  value: unknown,
  models: Pick<ProviderModel, 'id'>[],
): boolean {
  if (EFFORT_SETTING_KEYS.has(key)) return isEffortLevel(value)
  if (MODEL_SETTING_KEYS.has(key)) {
    return typeof value === 'string' && models.some((model) => model.id === value)
  }
  return true
}
