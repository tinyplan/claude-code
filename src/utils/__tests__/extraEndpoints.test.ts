import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'

// Mock dependencies before importing the module
import { logMock } from '../../../tests/mocks/log'
mock.module('src/utils/log.ts', logMock)

import { debugMock } from '../../../tests/mocks/debug'
mock.module('src/utils/debug.ts', debugMock)

// Mock bun:bundle (feature flags)
mock.module('bun:bundle', () => ({
  feature: () => false,
}))

// Mock settings module
const mockSettings = {
  extra_endpoints: undefined as Record<string, any> | undefined,
  initial_endpoint: undefined as string | undefined,
  current_endpoint: undefined as string | undefined,
  modelType: undefined as string | undefined,
}
mock.module('src/utils/settings/settings.js', () => ({
  getInitialSettings: () => mockSettings,
  updateSettingsForSource: (_source: string, updates: Record<string, any>) => {
    // Handle all keys including those set to undefined
    if ('current_endpoint' in updates) {
      mockSettings.current_endpoint = updates.current_endpoint
    }
    if ('modelType' in updates) {
      mockSettings.modelType = updates.modelType
    }
  },
}))

// Mock settings cache reset
mock.module('src/utils/settings/settingsCache.js', () => ({
  resetSettingsCache: () => {
    // No-op in tests - mockSettings is already updated directly
  },
}))

const {
  isExtraEndpointsEnabled,
  loadCurrentEndpoint,
  getCurrentEndpointName,
  switchEndpoint,
  getEndpointNames,
  getEndpointConfig,
  resetEndpointState,
  applyEndpointToEnv,
} = await import('../extraEndpoints')

describe('extraEndpoints', () => {
  const originalEnv = {
    CLAUDE_CODE_EXTRA_ENDPOINTS: process.env.CLAUDE_CODE_EXTRA_ENDPOINTS,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
    CLAUDE_CODE_USE_BEDROCK: process.env.CLAUDE_CODE_USE_BEDROCK,
    CLAUDE_CODE_USE_GEMINI: process.env.CLAUDE_CODE_USE_GEMINI,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  }

  beforeEach(() => {
    // Reset mock settings
    mockSettings.extra_endpoints = undefined
    mockSettings.initial_endpoint = undefined
    mockSettings.current_endpoint = undefined
    mockSettings.modelType = undefined

    // Clear endpoint state
    resetEndpointState()

    // Clear environment variables
    delete process.env.CLAUDE_CODE_EXTRA_ENDPOINTS
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_BASE_URL
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_BASE_URL
    delete process.env.CLAUDE_CODE_USE_BEDROCK
    delete process.env.CLAUDE_CODE_USE_GEMINI
    delete process.env.GEMINI_API_KEY
  })

  afterEach(async () => {
    // Restore original environment
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) {
        process.env[key] = value
      } else {
        delete process.env[key]
      }
    }

    // Reset state
    await resetEndpointState()
  })

  // ─── Feature Flag Check ─────────────────────────────────────────────────

  describe('isExtraEndpointsEnabled', () => {
    test('returns false when CLAUDE_CODE_EXTRA_ENDPOINTS is not set', () => {
      delete process.env.CLAUDE_CODE_EXTRA_ENDPOINTS
      expect(isExtraEndpointsEnabled()).toBe(false)
    })

    test('returns true when CLAUDE_CODE_EXTRA_ENDPOINTS=1', () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'
      expect(isExtraEndpointsEnabled()).toBe(true)
    })

    test('returns true when CLAUDE_CODE_EXTRA_ENDPOINTS=true', () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = 'true'
      expect(isExtraEndpointsEnabled()).toBe(true)
    })

    test('returns false when CLAUDE_CODE_EXTRA_ENDPOINTS=0', () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '0'
      expect(isExtraEndpointsEnabled()).toBe(false)
    })

    test('returns false when CLAUDE_CODE_EXTRA_ENDPOINTS is empty', () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = ''
      expect(isExtraEndpointsEnabled()).toBe(false)
    })
  })

  // ─── Load Current Endpoint ───────────────────────────────────────────────

  describe('loadCurrentEndpoint', () => {
    test('returns null when feature is disabled', () => {
      delete process.env.CLAUDE_CODE_EXTRA_ENDPOINTS
      expect(loadCurrentEndpoint()).toBe(null)
    })

    test('returns null when no endpoints configured', () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'
      mockSettings.extra_endpoints = undefined
      expect(loadCurrentEndpoint()).toBe(null)
    })

    test('returns null when extra_endpoints is empty', () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'
      mockSettings.extra_endpoints = {}
      expect(loadCurrentEndpoint()).toBe(null)
    })

    test('returns first endpoint when no initial_endpoint specified', async () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'
      mockSettings.extra_endpoints = {
        deepseek: {
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: 'sk-test',
          protocol: 'openai',
        },
        zhipu: {
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          apiKey: 'zhipu-key',
          protocol: 'openai',
        },
      }

      // Reset to trigger re-initialization
      await resetEndpointState()
      const endpoint = loadCurrentEndpoint()
      expect(endpoint).not.toBe(null)
      expect(endpoint?.baseUrl).toBe('https://api.deepseek.com/v1')
      expect(endpoint?.apiKey).toBe('sk-test')
      expect(endpoint?.protocol).toBe('openai')
    })

    test('returns initial_endpoint when specified', async () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'
      mockSettings.extra_endpoints = {
        deepseek: {
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: 'sk-test',
          protocol: 'openai',
        },
        zhipu: {
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          apiKey: 'zhipu-key',
          protocol: 'openai',
        },
      }
      mockSettings.initial_endpoint = 'zhipu'

      await resetEndpointState()
      const endpoint = loadCurrentEndpoint()
      expect(endpoint).not.toBe(null)
      expect(endpoint?.baseUrl).toBe('https://open.bigmodel.cn/api/paas/v4')
      expect(endpoint?.apiKey).toBe('zhipu-key')
    })

    test('falls back to current_endpoint when initial_endpoint invalid', async () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'
      mockSettings.extra_endpoints = {
        deepseek: {
          baseUrl: 'https://api.deepseek.com',
          apiKey: 'sk',
          protocol: 'openai',
        },
      }
      mockSettings.initial_endpoint = 'nonexistent'
      mockSettings.current_endpoint = 'deepseek'

      await resetEndpointState()
      const endpoint = loadCurrentEndpoint()
      expect(endpoint?.baseUrl).toBe('https://api.deepseek.com')
    })

    test('defaults protocol to openai when not specified', async () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'
      mockSettings.extra_endpoints = {
        custom: {
          baseUrl: 'https://api.custom.com/v1',
          apiKey: 'custom-key',
          // protocol omitted
        },
      }

      await resetEndpointState()
      const endpoint = loadCurrentEndpoint()
      expect(endpoint?.protocol).toBe('openai')
    })

    test('clears other provider env vars on initialization', async () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'
      process.env.CLAUDE_CODE_USE_BEDROCK = '1'
      process.env.GEMINI_API_KEY = 'gemini-key'

      mockSettings.extra_endpoints = {
        deepseek: {
          baseUrl: 'https://api.deepseek.com',
          apiKey: 'sk',
          protocol: 'openai',
        },
      }

      await resetEndpointState()
      loadCurrentEndpoint()

      expect(process.env.CLAUDE_CODE_USE_BEDROCK).toBeUndefined()
      expect(process.env.GEMINI_API_KEY).toBeUndefined()
    })
  })

  // ─── GetCurrentEndpointName ──────────────────────────────────────────────

  describe('getCurrentEndpointName', () => {
    test('returns null when feature disabled', () => {
      delete process.env.CLAUDE_CODE_EXTRA_ENDPOINTS
      expect(getCurrentEndpointName()).toBe(null)
    })

    test('returns endpoint name after initialization', async () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'
      mockSettings.extra_endpoints = {
        deepseek: {
          baseUrl: 'https://api.deepseek.com',
          apiKey: 'sk',
          protocol: 'openai',
        },
      }

      await resetEndpointState()
      expect(getCurrentEndpointName()).toBe('deepseek')
    })
  })

  // ─── SwitchEndpoint ──────────────────────────────────────────────────────

  describe('switchEndpoint', () => {
    beforeEach(async () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'
      mockSettings.extra_endpoints = {
        deepseek: {
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: 'sk-deepseek',
          protocol: 'openai',
        },
        anthropic_custom: {
          baseUrl: 'https://anthropic-proxy.example.com',
          apiKey: 'sk-anthropic',
          protocol: 'anthropic',
        },
      }
      await resetEndpointState()
    })

    test('returns false for nonexistent endpoint', () => {
      expect(switchEndpoint('nonexistent')).toBe(false)
    })

    test('returns true and switches to valid endpoint', () => {
      const result = switchEndpoint('anthropic_custom')
      expect(result).toBe(true)
      expect(getCurrentEndpointName()).toBe('anthropic_custom')
      expect(loadCurrentEndpoint()?.protocol).toBe('anthropic')
    })

    test('updates current_endpoint in settings', () => {
      switchEndpoint('anthropic_custom')
      expect(mockSettings.current_endpoint).toBe('anthropic_custom')
    })

    test('switchEndpoint does not apply env vars (caller responsibility)', () => {
      switchEndpoint('deepseek')
      // Env vars should NOT be automatically applied
      expect(process.env.OPENAI_API_KEY).toBeUndefined()
    })

    test('updates modelType to openai for openai protocol endpoint', () => {
      // Start with anthropic modelType
      mockSettings.modelType = 'anthropic'
      switchEndpoint('deepseek')
      expect(mockSettings.modelType).toBe('openai')
    })

    test('updates modelType to anthropic for anthropic protocol endpoint', () => {
      // Start with openai modelType
      mockSettings.modelType = 'openai'
      switchEndpoint('anthropic_custom')
      expect(mockSettings.modelType).toBe('anthropic')
    })

    test('modelType defaults to openai when endpoint has no protocol specified', async () => {
      mockSettings.extra_endpoints = {
        custom: {
          baseUrl: 'https://api.custom.com',
          apiKey: 'key',
          // protocol omitted - should default to openai
        },
      }
      mockSettings.modelType = 'anthropic'
      switchEndpoint('custom')
      expect(mockSettings.modelType).toBe('openai')
    })
  })

  // ─── GetEndpointNames ────────────────────────────────────────────────────

  describe('getEndpointNames', () => {
    test('returns empty array when no endpoints', () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'
      mockSettings.extra_endpoints = undefined
      expect(getEndpointNames()).toEqual([])
    })

    test('returns all endpoint names', () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'
      mockSettings.extra_endpoints = {
        deepseek: { baseUrl: 'a', apiKey: 'b', protocol: 'openai' },
        zhipu: { baseUrl: 'c', apiKey: 'd', protocol: 'openai' },
      }
      expect(getEndpointNames()).toEqual(['deepseek', 'zhipu'])
    })
  })

  // ─── GetEndpointConfig ───────────────────────────────────────────────────

  describe('getEndpointConfig', () => {
    test('returns null for nonexistent endpoint', () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'
      mockSettings.extra_endpoints = {
        deepseek: { baseUrl: 'a', apiKey: 'b', protocol: 'openai' },
      }
      expect(getEndpointConfig('nonexistent')).toBe(null)
    })

    test('returns config for valid endpoint', () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'
      mockSettings.extra_endpoints = {
        deepseek: {
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: 'sk-test',
          protocol: 'openai',
        },
      }
      const config = getEndpointConfig('deepseek')
      expect(config).not.toBe(null)
      expect(config?.baseUrl).toBe('https://api.deepseek.com/v1')
      expect(config?.apiKey).toBe('sk-test')
      expect(config?.protocol).toBe('openai')
    })

    test('defaults protocol to openai', () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'
      mockSettings.extra_endpoints = {
        custom: { baseUrl: 'https://api.custom.com', apiKey: 'key' },
      }
      const config = getEndpointConfig('custom')
      expect(config?.protocol).toBe('openai')
    })
  })

  // ─── ApplyEndpointToEnv ──────────────────────────────────────────────────

  describe('applyEndpointToEnv', () => {
    beforeEach(async () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'
      mockSettings.extra_endpoints = {
        openai_endpoint: {
          baseUrl: 'https://api.openai-proxy.com/v1',
          apiKey: 'sk-openai',
          protocol: 'openai',
        },
        anthropic_endpoint: {
          baseUrl: 'https://anthropic-proxy.example.com',
          apiKey: 'sk-anthropic',
          protocol: 'anthropic',
        },
      }
      await resetEndpointState()
    })

    test('sets OPENAI env vars for openai protocol', async () => {
      await resetEndpointState()
      loadCurrentEndpoint() // Initialize with first endpoint (openai_endpoint)
      applyEndpointToEnv()

      expect(process.env.OPENAI_API_KEY).toBe('sk-openai')
      expect(process.env.OPENAI_BASE_URL).toBe(
        'https://api.openai-proxy.com/v1',
      )
      // Anthropic env vars should be cleared
      expect(process.env.ANTHROPIC_API_KEY).toBeUndefined()
      expect(process.env.ANTHROPIC_BASE_URL).toBeUndefined()
    })

    test('sets ANTHROPIC env vars for anthropic protocol', async () => {
      switchEndpoint('anthropic_endpoint')
      applyEndpointToEnv()

      expect(process.env.ANTHROPIC_API_KEY).toBe('sk-anthropic')
      expect(process.env.ANTHROPIC_BASE_URL).toBe(
        'https://anthropic-proxy.example.com',
      )
      expect(process.env.OPENAI_API_KEY).toBeUndefined()
      expect(process.env.OPENAI_BASE_URL).toBeUndefined()
    })

    test('does nothing when no endpoint active', () => {
      delete process.env.CLAUDE_CODE_EXTRA_ENDPOINTS
      applyEndpointToEnv()

      expect(process.env.OPENAI_API_KEY).toBeUndefined()
      expect(process.env.ANTHROPIC_API_KEY).toBeUndefined()
    })
  })

  // ─── ResetEndpointState ──────────────────────────────────────────────────

  describe('resetEndpointState', () => {
    test('clears all state and re-initializes', async () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'
      mockSettings.extra_endpoints = {
        deepseek: {
          baseUrl: 'https://api.deepseek.com',
          apiKey: 'key',
          protocol: 'openai',
        },
      }
      mockSettings.current_endpoint = 'deepseek'
      mockSettings.modelType = 'openai'

      // Initialize
      loadCurrentEndpoint()
      expect(getCurrentEndpointName()).toBe('deepseek')

      // Reset
      await resetEndpointState()

      // After reset, calling loadCurrentEndpoint will re-initialize
      // with the current settings (which may still have endpoints)
      // The key behavior is that state is cleared and settings.current_endpoint is unset
      expect(mockSettings.current_endpoint).toBeUndefined()
      expect(mockSettings.modelType).toBeUndefined()
    })

    test('clears modelType along with current_endpoint', async () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'
      mockSettings.extra_endpoints = {
        deepseek: {
          baseUrl: 'https://api.deepseek.com',
          apiKey: 'key',
          protocol: 'openai',
        },
      }
      // Simulate state after switchEndpoint
      mockSettings.modelType = 'openai'
      mockSettings.current_endpoint = 'deepseek'

      await resetEndpointState()

      // Both should be cleared
      expect(mockSettings.current_endpoint).toBeUndefined()
      expect(mockSettings.modelType).toBeUndefined()
    })

    test('allows fresh initialization after reset', async () => {
      process.env.CLAUDE_CODE_EXTRA_ENDPOINTS = '1'

      // First endpoint config
      mockSettings.extra_endpoints = {
        deepseek: {
          baseUrl: 'https://api.deepseek.com',
          apiKey: 'key',
          protocol: 'openai',
        },
      }

      loadCurrentEndpoint()
      expect(getCurrentEndpointName()).toBe('deepseek')

      // Reset
      await resetEndpointState()

      // Change config
      mockSettings.extra_endpoints = {
        zhipu: {
          baseUrl: 'https://open.bigmodel.cn',
          apiKey: 'zhipu',
          protocol: 'openai',
        },
      }

      // Re-initialize should pick up new config
      const endpoint = loadCurrentEndpoint()
      expect(endpoint?.baseUrl).toBe('https://open.bigmodel.cn')
      expect(getCurrentEndpointName()).toBe('zhipu')
    })
  })
})
