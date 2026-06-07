# Extra Endpoints 实现计划

## Context

用户希望动态切换国内 API 提供商（如 DeepSeek、智谱、月之暗面等），这些提供商都提供 OpenAI 和 Anthropic 兼容接口。当前系统依赖分散的环境变量（`OPENAI_*`、`GEMINI_*`），切换不便且配置无法持久化。

**目标**：
- 新增 `extra_endpoints` 配置块存储多端点配置
- 通过 slash command `/endpoint` 动态切换
- 环境变量 `CLAUDE_CODE_EXTRA_ENDPOINTS=1` 启用此功能
- 支持 OpenAI 和 Anthropic 双协议

## 设计概览

### 配置结构

```typescript
// settings.json (仅 userSettings)
{
  "extra_endpoints": {
    "deepseek": {
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "sk-...",
      "protocol": "openai"
    },
    "zhipu": {
      "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
      "apiKey": "...",
      "protocol": "openai"
    }
  },
  "current_endpoint": "deepseek"  // 当前激活的端点名称
}
```

### 核心流程

1. **启动时**：检测 `CLAUDE_CODE_EXTRA_ENDPOINTS=1` → 加载 `extra_endpoints` 配置 → 设置 `current_endpoint` 指向的端点
2. **切换时**：用户执行 `/endpoint <name>` → 更新 `current_endpoint` → 清除客户端缓存 → 后续 API 调用使用新端点
3. **API 调用**：根据 `current_endpoint.protocol` 选择 OpenAI 或 Anthropic 客户端，读取对应 baseUrl/apiKey

## 实现步骤

### Step 1: 新增 Settings Schema

**文件**: `src/utils/settings/types.ts`

在 `SettingsSchema` 中新增两个字段（约 368 行附近，`modelType` 字段旁）：

```typescript
// 端点配置 Schema
const ExtraEndpointSchema = lazySchema(() =>
  z.object({
    baseUrl: z.string().describe('API base URL'),
    apiKey: z.string().describe('API key'),
    protocol: z
      .enum(['openai', 'anthropic'])
      .optional()
      .default('openai')
      .describe('Protocol type: openai or anthropic'),
  }),
)

const ExtraEndpointsSchema = lazySchema(() =>
  z
    .record(z.string(), ExtraEndpointSchema())
    .optional()
    .describe(
      'Extra API endpoints configuration. ' +
        'Only allowed in userSettings (contains sensitive API keys). ' +
        'Enable via CLAUDE_CODE_EXTRA_ENDPOINTS=1 environment variable.',
    ),
)

const CurrentEndpointSchema = lazySchema(() =>
  z
    .string()
    .optional()
    .describe('Name of the currently active extra endpoint'),
)
```

### Step 2: 新增端点状态管理模块

**文件**: `src/utils/customEndpoints.ts` (新建)

参考 `src/commands/poor/poorMode.ts` 的模式：

```typescript
import { getInitialSettings, updateSettingsForSource } from './settings/settings.js'
import { isEnvTruthy } from './envUtils.js'

export interface ExtraEndpoint {
  baseUrl: string
  apiKey: string
  protocol: 'openai' | 'anthropic'
}

let currentEndpoint: ExtraEndpoint | null = null
let currentEndpointName: string | null = null

/** 检查是否启用自定义端点功能 */
export function isExtraEndpointsEnabled(): boolean {
  return isEnvTruthy(process.env.CLAUDE_CODE_EXTRA_ENDPOINTS)
}

/** 加载当前激活的端点配置 */
export function loadCurrentEndpoint(): ExtraEndpoint | null {
  if (!isExtraEndpointsEnabled()) return null
  
  if (currentEndpoint === null) {
    const settings = getInitialSettings()
    const endpoints = settings.extra_endpoints
    const name = settings.current_endpoint
    
    if (endpoints && name && endpoints[name]) {
      const config = endpoints[name]
      currentEndpoint = {
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        protocol: config.protocol || 'openai',
      }
      currentEndpointName = name
    }
  }
  return currentEndpoint
}

/** 获取当前端点名称 */
export function getCurrentEndpointName(): string | null {
  return currentEndpointName
}

/** 切换到指定端点 */
export function switchEndpoint(name: string): boolean {
  const settings = getInitialSettings()
  const endpoints = settings.extra_endpoints
  
  if (!endpoints || !endpoints[name]) {
    return false
  }
  
  const config = endpoints[name]
  currentEndpoint = {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    protocol: config.protocol || 'openai',
  }
  currentEndpointName = name
  
  // 持久化到 settings
  updateSettingsForSource('userSettings', { current_endpoint: name })
  
  return true
}

/** 获取所有端点名称列表 */
export function getEndpointNames(): string[] {
  const settings = getInitialSettings()
  return Object.keys(settings.extra_endpoints || {})
}

/** 应用当前端点到 process.env（供 API 客户端使用） */
export function applyEndpointToEnv(): void {
  const endpoint = loadCurrentEndpoint()
  if (!endpoint) return
  
  if (endpoint.protocol === 'openai') {
    process.env.OPENAI_API_KEY = endpoint.apiKey
    process.env.OPENAI_BASE_URL = endpoint.baseUrl
  } else {
    process.env.ANTHROPIC_API_KEY = endpoint.apiKey
    process.env.ANTHROPIC_BASE_URL = endpoint.baseUrl
  }
}
```

### Step 3: 新增 `/endpoint` 命令

**文件**: `src/commands/endpoint/index.ts` (新建)

```typescript
import type { Command } from '../../commands.js'

const endpoint = {
  type: 'local',
  name: 'endpoint',
  description: 'Switch custom API endpoint',
  aliases: ['ep'],
  argumentHint: '[name|list|unset]',
  supportsNonInteractive: true,
  load: () => import('./endpoint.js'),
} satisfies Command

export default endpoint
```

**文件**: `src/commands/endpoint/endpoint.ts` (新建)

```typescript
import type { LocalCommandCall } from '../../types/command.js'
import {
  isExtraEndpointsEnabled,
  getCurrentEndpointName,
  switchEndpoint,
  getEndpointNames,
  applyEndpointToEnv,
} from '../../utils/customEndpoints.js'
import { clearOpenAIClientCache } from '../../services/api/openai/client.js'

export const call: LocalCommandCall = async (args, _context) => {
  if (!isExtraEndpointsEnabled()) {
    return {
      type: 'text',
      value: 'Custom endpoints not enabled. Set CLAUDE_CODE_EXTRA_ENDPOINTS=1 to enable.',
    }
  }
  
  const arg = args.trim().toLowerCase()
  
  // 无参数：显示当前端点
  if (!arg) {
    const current = getCurrentEndpointName()
    if (!current) {
      return { type: 'text', value: 'No endpoint active. Use /endpoint <name> to switch.' }
    }
    return { type: 'text', value: `Current endpoint: ${current}` }
  }
  
  // list：列出所有端点
  if (arg === 'list') {
    const names = getEndpointNames()
    const current = getCurrentEndpointName()
    if (names.length === 0) {
      return { type: 'text', value: 'No endpoints configured in settings.json' }
    }
    const lines = names.map(n => n === current ? `* ${n} (active)` : `  ${n}`)
    return { type: 'text', value: `Available endpoints:\n${lines.join('\n')}` }
  }
  
  // unset：清除当前端点
  if (arg === 'unset') {
    // 恢复默认环境变量
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_BASE_URL
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_BASE_URL
    clearOpenAIClientCache()
    return { type: 'text', value: 'Endpoint unset. Using default provider.' }
  }
  
  // 切换端点
  const success = switchEndpoint(arg)
  if (!success) {
    const names = getEndpointNames()
    return {
      type: 'text',
      value: `Endpoint "${arg}" not found. Available: ${names.join(', ') || '(none)'}`,
    }
  }
  
  // 应用到环境变量并清除缓存
  applyEndpointToEnv()
  clearOpenAIClientCache()
  
  return { type: 'text', value: `Switched to endpoint: ${arg}` }
}
```

### Step 4: 注册命令到 main.tsx

**文件**: `src/main.tsx`

在命令注册区域添加（参考 `poor`、`provider` 的注册方式）：

```typescript
import endpoint from './commands/endpoint/index.js'
// ...
.program
  .command(endpoint)
```

### Step 5: 修改 API 客户端支持自定义端点

**文件**: `src/services/api/openai/client.ts`

修改 `getOpenAIClient()` 函数，优先读取自定义端点配置：

```typescript
import { loadCurrentEndpoint, isExtraEndpointsEnabled } from '../../utils/customEndpoints.js'

export function getOpenAIClient(options?: {
  maxRetries?: number
  fetchOverride?: typeof fetch
  source?: string
}): OpenAI {
  if (cachedClient) return cachedClient

  // 优先使用自定义端点
  let apiKey = process.env.OPENAI_API_KEY || ''
  let baseURL = process.env.OPENAI_BASE_URL
  
  if (isExtraEndpointsEnabled()) {
    const endpoint = loadCurrentEndpoint()
    if (endpoint && endpoint.protocol === 'openai') {
      apiKey = endpoint.apiKey
      baseURL = endpoint.baseUrl
    }
  }

  // ... 后续代码不变
}
```

**文件**: `src/services/api/claude.ts`

支持 Anthropic 协议端点：

```typescript
import { loadCurrentEndpoint, isExtraEndpointsEnabled } from '../../utils/customEndpoints.js'

// 在构建请求时检查自定义端点
if (isExtraEndpointsEnabled()) {
  const endpoint = loadCurrentEndpoint()
  if (endpoint && endpoint.protocol === 'anthropic') {
    // 使用 endpoint.baseUrl 和 endpoint.apiKey
  }
}
```

### Step 6: 启动时加载自定义端点

**文件**: `src/entrypoints/init.ts` 或 `src/bootstrap/state.ts`

在初始化流程中添加：

```typescript
import { isExtraEndpointsEnabled, loadCurrentEndpoint, applyEndpointToEnv } from '../utils/customEndpoints.js'

// 在初始化阶段
if (isExtraEndpointsEnabled()) {
  loadCurrentEndpoint()
  applyEndpointToEnv()
}
```

### Step 7: 验证 extra_endpoints 仅在 userSettings 中

**文件**: `src/utils/settings/validation.ts`

新增验证函数：

```typescript
export function validateExtraEndpointsScope(
  settings: SettingsJson,
  source: SettingSource,
): ValidationError[] {
  if (settings.extra_endpoints && source !== 'userSettings') {
    return [{
      path: 'extra_endpoints',
      message: 'extra_endpoints only allowed in userSettings (contains sensitive API keys)',
      suggestion: 'Move extra_endpoints to ~/.claude/settings.json',
    }]
  }
  return []
}
```

在相关验证流程中调用此函数。

## 需修改的文件清单

| 文件 | 操作 | 修改内容 |
|------|------|---------|
| `src/utils/settings/types.ts` | 修改 | 新增 `ExtraEndpointsSchema`、`CurrentEndpointSchema` |
| `src/utils/customEndpoints.ts` | 新建 | 端点状态管理模块 |
| `src/commands/endpoint/index.ts` | 新建 | 命令注册 |
| `src/commands/endpoint/endpoint.ts` | 新建 | 命令实现 |
| `src/main.tsx` | 修改 | 注册 `/endpoint` 命令 |
| `src/services/api/openai/client.ts` | 修改 | 优先读取自定义端点配置 |
| `src/services/api/claude.ts` | 修改 | 支持 Anthropic 协议端点 |
| `src/utils/settings/validation.ts` | 修改 | 新增 scope 验证 |
| `src/entrypoints/init.ts` 或 `src/bootstrap/state.ts` | 修改 | 启动时加载端点配置 |

## 向后兼容

1. **环境变量优先级**：自定义端点 > `settings.env` > `process.env`
2. **不启用时完全兼容**：未设置 `CLAUDE_CODE_EXTRA_ENDPOINTS=1` 时，系统行为完全不变
3. **渐进迁移**：用户可逐步将环境变量配置迁移到 `extra_endpoints`

## 验证方案

### 单元测试

**文件**: `src/utils/__tests__/customEndpoints.test.ts` (新建)

- 测试 `isExtraEndpointsEnabled()` 环境变量检测
- 测试 `loadCurrentEndpoint()` 配置加载
- 测试 `switchEndpoint()` 切换逻辑
- 测试 `applyEndpointToEnv()` 环境变量应用

### 手动验证

```bash
# 1. 配置 settings.json
cat ~/.claude/settings.json
# {
#   "extra_endpoints": {
#     "deepseek": { "baseUrl": "...", "apiKey": "...", "protocol": "openai" }
#   }
# }

# 2. 启用功能并启动
CLAUDE_CODE_EXTRA_ENDPOINTS=1 bun run dev

# 3. 测试命令
/endpoint list      # 列出端点
/endpoint deepseek  # 切换端点
/endpoint           # 显示当前端点
/endpoint unset     # 清除端点

# 4. 验证 API 调用
# 发送消息，检查是否使用了正确的 baseUrl/apiKey
```

## 待确认事项

1. **命令注册位置**：需确认 `main.tsx` 中命令注册的具体位置和方式
2. **Anthropic 客户端修改范围**：需确认 `claude.ts` 中 baseUrl/apiKey 的注入位置
3. **验证函数调用时机**：需确认 scope 验证应在哪个环节执行