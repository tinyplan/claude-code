import type { LocalCommandCall } from '../../types/command.js'
import {
  isExtraEndpointsEnabled,
  getCurrentEndpointName,
  switchEndpoint,
  getEndpointNames,
  applyEndpointToEnv,
  resetEndpointState,
  loadCurrentEndpoint,
  validateModelAvailability,
  type ExtraEndpoint,
} from '../../utils/extraEndpoints.js'
import { clearAnthropicClientCache } from '../../services/api/client.js'
import { clearOpenAIClientCache } from '../../services/api/openai/client.js'
import {
  getUserSpecifiedModelSetting,
  renderModelSetting,
} from '../../utils/model/model.js'
import { isModelAlias } from '../../utils/model/aliases.js'

/**
 * Check whether the current model is compatible with the endpoint's protocol.
 * Calls the endpoint's API to get available models and validates model availability.
 */
async function getModelValidationWarning(
  endpoint: ExtraEndpoint,
): Promise<string | null> {
  const currentModel = getUserSpecifiedModelSetting()

  // null / alias models always resolve appropriately, no warning needed
  if (
    currentModel === null ||
    currentModel === undefined ||
    isModelAlias(currentModel)
  ) {
    return null
  }

  const result = await validateModelAvailability(endpoint, currentModel)

  // Could not validate - no warning
  if (!result.validated) {
    return null
  }

  // Model is available - no warning
  if (result.available) {
    return null
  }

  // Model not available - show warning with available models
  const modelDisplay = renderModelSetting(currentModel)
  if (result.availableModels && result.availableModels.length > 0) {
    const modelsList = result.availableModels.slice(0, 5).join(', ')
    const more =
      result.availableModels.length > 5
        ? ` (and ${result.availableModels.length - 5} more)`
        : ''
    return `Current model "${modelDisplay}" may not be available on this endpoint. Available models: ${modelsList}${more}. Use /model to switch.`
  }

  return `Current model "${modelDisplay}" may not be available on this endpoint. Use /model to switch to an available model.`
}

export const call: LocalCommandCall = async (args, _context) => {
  if (!isExtraEndpointsEnabled()) {
    return {
      type: 'text',
      value:
        'Extra endpoints not enabled. Set CLAUDE_CODE_EXTRA_ENDPOINTS=1 to enable.',
    }
  }

  const arg = args.trim().toLowerCase()

  // No argument: show current endpoint
  if (!arg) {
    const current = getCurrentEndpointName()
    if (!current) {
      return {
        type: 'text',
        value: 'No endpoint active. Use /endpoint <name> to switch.',
      }
    }
    return { type: 'text', value: `Current endpoint: ${current}` }
  }

  // list: show all endpoints
  if (arg === 'list') {
    const names = getEndpointNames()
    const current = getCurrentEndpointName()
    if (names.length === 0) {
      return {
        type: 'text',
        value: 'No endpoints configured in settings.json',
      }
    }
    const lines = names.map(n => (n === current ? `* ${n} (active)` : `  ${n}`))
    return {
      type: 'text',
      value: `Available endpoints:\n${lines.join('\n')}`,
    }
  }

  // Switch endpoint
  const success = switchEndpoint(arg)
  if (!success) {
    const names = getEndpointNames()
    return {
      type: 'text',
      value: `Endpoint "${arg}" not found. Available: ${names.join(', ') || '(none)'}`,
    }
  }

  // Apply to env and clear caches
  applyEndpointToEnv()
  clearAnthropicClientCache()
  clearOpenAIClientCache()

  // Check model compatibility by calling endpoint API
  const endpoint = loadCurrentEndpoint()
  let message = `Switched to endpoint: ${arg}`
  if (endpoint) {
    const modelWarning = await getModelValidationWarning(endpoint)
    if (modelWarning) {
      message += `\n⚠ ${modelWarning}`
    }
  }

  return { type: 'text', value: message }
}
