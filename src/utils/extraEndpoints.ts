/**
 * Extra endpoints state management — dynamically switch between
 * OpenAI/Anthropic compatible API providers (DeepSeek, Zhipu, Moonshot, etc.)
 *
 * Enable via CLAUDE_CODE_EXTRA_ENDPOINTS=1 environment variable.
 * Configuration stored in settings.json (userSettings only).
 *
 * When enabled:
 * - extra_endpoints MUST have at least one endpoint configured
 * - First endpoint is used as default if initial_endpoint is not specified
 * - Other provider env vars (bedrock, vertex, foundry, gemini, grok) are cleared
 */

import {
  getInitialSettings,
  updateSettingsForSource,
} from './settings/settings.js'
import { isEnvTruthy } from './envUtils.js'
import { logError } from './log.js'
import { resetSettingsCache } from './settings/settingsCache.js'

export interface ExtraEndpoint {
  baseUrl: string
  apiKey: string
  protocol: 'openai' | 'anthropic'
}

export interface ExtraEndpointConfig {
  baseUrl: string
  apiKey: string
  protocol?: 'openai' | 'anthropic'
}

/**
 * Provider environment variables mapping.
 * Each provider has a list of env vars that need to be managed during endpoint switching.
 */
export const PROVIDER_ENV_VARS: Record<string, string[]> = {
  openai: ['OPENAI_API_KEY', 'OPENAI_BASE_URL'],
  anthropic: ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL'],
  // Future providers can be added here with their specific env vars
}

/**
 * Get all endpoint-related environment variable names.
 * Used by managedEnv.ts to filter these vars from settings.env.
 */
export function getEndpointEnvVarNames(): Set<string> {
  const allVars = new Set<string>()
  for (const keys of Object.values(PROVIDER_ENV_VARS)) {
    for (const key of keys) {
      allVars.add(key)
    }
  }
  // Also include ANTHROPIC_AUTH_TOKEN (OAuth token, equivalent to API key)
  allVars.add('ANTHROPIC_AUTH_TOKEN')
  return allVars
}

/**
 * Clear provider environment variables, excluding the specified provider.
 * @param excludeProvider The provider to exclude (its env vars will not be cleared)
 */
function clearProviderEnvVars(excludeProvider: string): void {
  for (const [provider, keys] of Object.entries(PROVIDER_ENV_VARS)) {
    if (provider !== excludeProvider) {
      for (const key of keys) {
        delete process.env[key]
      }
    }
  }
}

let currentEndpoint: ExtraEndpoint | null = null
let currentEndpointName: string | null = null
let initialized = false

/** Check if extra endpoints feature is enabled */
export function isExtraEndpointsEnabled(): boolean {
  return isEnvTruthy(process.env.CLAUDE_CODE_EXTRA_ENDPOINTS)
}

/**
 * Other provider environment variables to clear when extra endpoints is enabled.
 * This ensures only OpenAI/Anthropic protocols are active for endpoint switching.
 */
const OTHER_PROVIDER_ENV_VARS = [
  // Bedrock
  'CLAUDE_CODE_USE_BEDROCK',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_REGION',
  // Vertex
  'CLAUDE_CODE_USE_VERTEX',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'ANTHROPIC_VERTEX_PROJECT_ID',
  // Foundry
  'CLAUDE_CODE_USE_FOUNDRY',
  // Gemini
  'CLAUDE_CODE_USE_GEMINI',
  'GEMINI_API_KEY',
  'GEMINI_BASE_URL',
  // Grok
  'CLAUDE_CODE_USE_GROK',
  'GROK_API_KEY',
  'XAI_API_KEY',
  'GROK_BASE_URL',
  // Legacy model mapping
  'GROK_MODEL',
  'GROK_MODEL_MAP',
  'GEMINI_MODEL',
  'GEMINI_DEFAULT_OPUS_MODEL',
  'GEMINI_DEFAULT_SONNET_MODEL',
  'GEMINI_DEFAULT_HAIKU_MODEL',
]

/** Clear other provider environment variables */
function clearOtherProviderEnvVars(): void {
  for (const key of OTHER_PROVIDER_ENV_VARS) {
    delete process.env[key]
  }
}

/**
 * Initialize extra endpoints on startup.
 * - Validates that extra_endpoints has at least one endpoint when enabled
 * - Selects first endpoint as default if initial_endpoint is not specified
 * - Clears other provider env vars to prevent conflicts
 * - Applies endpoint config to process.env for API clients
 */
function initializeEndpoints(): void {
  if (!isExtraEndpointsEnabled()) {
    initialized = true
    return
  }

  const settings = getInitialSettings()
  const endpoints = settings.extra_endpoints as
    | Record<string, ExtraEndpointConfig>
    | undefined

  // Validate: must have at least one endpoint configured
  if (!endpoints || Object.keys(endpoints).length === 0) {
    logError(
      new Error(
        'CLAUDE_CODE_EXTRA_ENDPOINTS is enabled but no endpoints configured in settings.json. ' +
          'Please add at least one endpoint to extra_endpoints in ~/.claude/settings.json',
      ),
    )
    initialized = true
    return
  }

  const endpointNames = Object.keys(endpoints)

  // Determine which endpoint to use
  const initialName = settings.initial_endpoint as string | undefined
  const currentName = settings.current_endpoint as string | undefined
  let targetName: string

  if (initialName && endpoints[initialName]) {
    targetName = initialName
  } else if (currentName && endpoints[currentName]) {
    targetName = currentName
  } else {
    // Use first endpoint as default
    targetName = endpointNames[0]!
  }

  const config = endpoints[targetName]!
  currentEndpoint = {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    protocol: config.protocol || 'openai',
  }
  currentEndpointName = targetName

  // Clear other provider env vars to prevent conflicts
  clearOtherProviderEnvVars()

  // Apply endpoint config to process.env for API clients
  // This ensures environment variables are synchronized on startup
  applyEndpointToEnvInternal(currentEndpoint)

  initialized = true
}

/** Load the currently active endpoint configuration */
export function loadCurrentEndpoint(): ExtraEndpoint | null {
  if (!isExtraEndpointsEnabled()) return null

  if (!initialized) {
    initializeEndpoints()
  }

  return currentEndpoint
}

/** Get the current endpoint name */
export function getCurrentEndpointName(): string | null {
  if (!isExtraEndpointsEnabled()) return null

  if (!initialized) {
    initializeEndpoints()
  }

  return currentEndpointName
}

/** Clear API client caches — lazy import to avoid circular dependency */
async function clearClientCaches(): Promise<void> {
  try {
    const { clearAnthropicClientCache } = await import(
      '../services/api/client.js'
    )
    const { clearOpenAIClientCache } = await import(
      '../services/api/openai/client.js'
    )
    clearAnthropicClientCache()
    clearOpenAIClientCache()
  } catch {
    // Ignore — cache clearing is best-effort
  }
}

/** Reset endpoint state (used when settings change) */
export async function resetEndpointState(): Promise<void> {
  currentEndpoint = null
  currentEndpointName = null
  initialized = false
  // Clear persisted current_endpoint and modelType
  // modelType must be cleared so getAPIProvider() doesn't return the old provider
  updateSettingsForSource('userSettings', {
    current_endpoint: undefined,
    modelType: undefined,
  })
  resetSettingsCache()
  // Clear API client caches atomically
  await clearClientCaches()
}

/** Switch to the specified endpoint */
export function switchEndpoint(name: string): boolean {
  const settings = getInitialSettings()
  const endpoints = settings.extra_endpoints as
    | Record<string, ExtraEndpointConfig>
    | undefined

  if (!endpoints || !endpoints[name]) {
    return false
  }

  const config = endpoints[name]
  const protocol = config.protocol || 'openai'
  currentEndpoint = {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    protocol,
  }
  currentEndpointName = name

  // Update modelType based on endpoint protocol to ensure getAPIProvider()
  // returns the correct provider. This is critical for provider selection
  // priority: modelType > env vars > extra endpoints.
  // Reset settings cache so subsequent getInitialSettings() calls see the update.
  const modelType = protocol === 'openai' ? 'openai' : 'anthropic'
  updateSettingsForSource('userSettings', { current_endpoint: name, modelType })
  resetSettingsCache()

  return true
}

/** Get all endpoint names */
export function getEndpointNames(): string[] {
  const settings = getInitialSettings()
  const endpoints = settings.extra_endpoints as
    | Record<string, ExtraEndpointConfig>
    | undefined
  return Object.keys(endpoints || {})
}

/** Get endpoint config by name */
export function getEndpointConfig(name: string): ExtraEndpoint | null {
  const settings = getInitialSettings()
  const endpoints = settings.extra_endpoints as
    | Record<string, ExtraEndpointConfig>
    | undefined

  if (!endpoints || !endpoints[name]) return null

  const config = endpoints[name]
  return {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    protocol: config.protocol || 'openai',
  }
}

/**
 * Internal function to apply endpoint config to process.env.
 * Used by initializeEndpoints() and applyEndpointToEnv().
 */
function applyEndpointToEnvInternal(endpoint: ExtraEndpoint): void {
  const protocol = endpoint.protocol

  // Set endpoint env vars based on protocol
  if (protocol === 'openai') {
    process.env.OPENAI_API_KEY = endpoint.apiKey
    process.env.OPENAI_BASE_URL = endpoint.baseUrl
  }
  if (protocol === 'anthropic') {
    process.env.ANTHROPIC_API_KEY = endpoint.apiKey
    process.env.ANTHROPIC_BASE_URL = endpoint.baseUrl
  }

  // Clear other providers' env vars
  clearProviderEnvVars(protocol)
}

/** Apply current endpoint to process.env (for API clients) */
export function applyEndpointToEnv(): void {
  const endpoint = loadCurrentEndpoint()
  if (!endpoint) return

  applyEndpointToEnvInternal(endpoint)
}

/**
 * Fetch available models from an OpenAI-compatible endpoint.
 * Calls the /v1/models API to get the list of available models.
 */
export async function fetchEndpointModels(
  endpoint: ExtraEndpoint,
): Promise<string[] | null> {
  if (endpoint.protocol !== 'openai') {
    // Anthropic API doesn't have a public models list endpoint
    // Return null to indicate we can't validate
    return null
  }

  try {
    // Normalize base URL - truncate to /v1 path before appending /models
    // If user configured baseUrl as "https://api.example.com/v1/chat",
    // we need to strip to "https://api.example.com/v1" first.
    let baseUrl = endpoint.baseUrl.replace(/\/$/, '')

    // If URL contains /v1, truncate everything after it
    const v1Index = baseUrl.indexOf('/v1')
    if (v1Index !== -1) {
      baseUrl = baseUrl.slice(0, v1Index + 3)
    } else {
      // Append /v1 if not already present
      baseUrl = baseUrl + '/v1'
    }

    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${endpoint.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    if (!data.data || !Array.isArray(data.data)) {
      return null
    }

    // Extract model IDs
    return data.data
      .map((model: { id?: string }) => model.id || '')
      .filter(Boolean)
  } catch {
    // Network error, timeout, or invalid response
    return null
  }
}

/**
 * Validate if a model is available on the endpoint.
 * Returns a validation result with available models if the model is not found.
 */
export interface ModelValidationResult {
  /** Whether the model is available */
  available: boolean
  /** Whether we could check model availability (false if API call failed) */
  validated: boolean
  /** List of available models (only if validated and model not available) */
  availableModels?: string[]
}

export async function validateModelAvailability(
  endpoint: ExtraEndpoint,
  modelName: string,
): Promise<ModelValidationResult> {
  // Anthropic endpoint - can't validate via API, return validated=false
  if (endpoint.protocol !== 'openai') {
    return { available: true, validated: false }
  }

  const models = await fetchEndpointModels(endpoint)

  if (models === null) {
    // Could not fetch models
    return { available: true, validated: false }
  }

  // Normalize model name for comparison
  const normalizedModel = modelName.toLowerCase().replace(/\[1m\]$/i, '')

  // Check if model is in the list — exact match or prefix match (startsWith)
  // Avoid includes() which causes false positives (e.g., "claude-sonnet" matches both "claude-sonnet-4-6" and "claude-sonnet-4-5")
  const available = models.some(
    m =>
      m.toLowerCase() === normalizedModel ||
      m.toLowerCase().startsWith(normalizedModel),
  )

  if (available) {
    return { available: true, validated: true }
  }

  // Model not found - return available models for user reference
  // Limit to 10 models to avoid overwhelming output
  const displayModels = models.slice(0, 10)
  return {
    available: false,
    validated: true,
    availableModels: displayModels,
  }
}
