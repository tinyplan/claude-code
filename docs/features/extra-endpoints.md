# Extra Endpoints 动态端点配置

本功能允许用户配置多个 OpenAI/Anthropic 兼容的 API 端点（如 DeepSeek、智谱、Moonshot 等），并在运行时动态切换，无需手动修改环境变量。

## 启用方式

通过环境变量 `CLAUDE_CODE_EXTRA_ENDPOINTS=1` 启用。

```bash
CLAUDE_CODE_EXTRA_ENDPOINTS=1 bun run dev
```

**启用后的行为**：
1. **必须配置端点**：`extra_endpoints` 必须至少有一个端点，否则会报错
2. **默认端点选择**：如果未设置 `initial_endpoint`，自动使用第一个端点作为默认
3. **清除其他供应商环境变量**：自动清除 Bedrock、Vertex、Foundry、Gemini、Grok 等供应商的环境变量，避免冲突

## 配置方式

在 `~/.claude/settings.json` 中配置：

```json
{
  "extra_endpoints": {
    "deepseek": {
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "sk-xxx",
      "protocol": "openai"
    },
    "zhipu": {
      "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
      "apiKey": "xxx.zhipu",
      "protocol": "openai"
    },
    "moonshot": {
      "baseUrl": "https://api.moonshot.cn/v1",
      "apiKey": "sk-xxx",
      "protocol": "openai"
    },
    "custom-anthropic": {
      "baseUrl": "https://my-proxy.example.com",
      "apiKey": "sk-ant-xxx",
      "protocol": "anthropic"
    }
  },
  "initial_endpoint": "zhipu"
}
```

### 配置字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `baseUrl` | string | ✅ | API base URL |
| `apiKey` | string | ✅ | API key |
| `protocol` | string | ❌ | 协议类型，可选 `openai` 或 `anthropic`，默认 `openai` |

**安全限制**：`extra_endpoints` 只允许在 `userSettings`（`~/.claude/settings.json`）中配置，防止 API key 被提交到项目配置文件。

## `/endpoint` 命令

| 用法 | 功能 |
|------|------|
| `/endpoint` | 显示当前端点 |
| `/endpoint list` | 列出所有已配置端点 |
| `/endpoint <name>` | 切换到指定端点 |
| `/ep` | 命令别名 |

> **注意**：如需恢复默认供应商，请重启 CLI 会话。

### 示例输出

```
> /endpoint list
Available endpoints:
* deepseek (active)
  zhipu
  moonshot
  custom-anthropic

> /endpoint zhipu
Switched to endpoint: zhipu
⚠ Current model "claude-sonnet-4-6" is a Claude model and may not be available on this endpoint. Use /model to switch to an available model.
```

## 端点优先级

API 客户端选择端点的优先级：

1. **teammate endpoint**（仅 in-process teammate）— AgentTool 的 `endpoint` 参数
2. **extra_endpoints.current_endpoint** — settings.json 中的当前端点
3. **环境变量** — `OPENAI_API_KEY`/`OPENAI_BASE_URL` 或 `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL`
4. **默认 provider** — Anthropic firstParty

## Teammate Endpoint 配置

在 Agent Swarm 中，可以为每个 teammate 指定独立的端点配置（目前仅支持 in-process teammate）。

### 使用方式

在 AgentTool 调用时添加 `endpoint` 参数：

```json
{
  "name": "researcher",
  "prompt": "研究...",
  "model": "haiku",
  "endpoint": "deepseek"
}
```

### Team 级别默认端点

可在 TeamFile 中设置 team 级别的默认端点：

```json
{
  "teammateDefaultEndpoint": "zhipu"
}
```

### Teammate 端点优先级

| 执行模式 | endpoint 支持 | 优先级 |
|---------|-------------|------|
| in-process | ✅ 支持 | AgentTool 参数 > Team 默认 > 全局配置 |
| tmux/iTerm2 | ❌ 暂不支持 | 继承父进程环境变量（无法差异化） |

### 模型兼容性警告

切换端点时，如果当前模型与目标端点协议不兼容，会显示警告：

- 切换到 `openai` 协议端点时，若当前模型是 Claude 模型，提示使用 `/model` 切换
- 切换到 `anthropic` 协议端点时，若当前模型不是 Claude 模型，同样提示

## 实现细节

### 相关文件

| 文件 | 功能 |
|------|------|
| `src/utils/extraEndpoints.ts` | 端点状态管理核心模块 |
| `src/commands/endpoint/` | `/endpoint` 命令实现 |
| `src/services/api/client.ts` | Anthropic client 端点选择逻辑 |
| `src/services/api/openai/client.ts` | OpenAI client 端点选择逻辑 |
| `src/utils/settings/types.ts` | `extra_endpoints` 和 `current_endpoint` 字段定义 |
| `src/utils/settings/validation.ts` | 端点配置 scope 校验 |
| `src/utils/swarm/teamHelpers.ts` | TeamFile 端点字段 |
| `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx` | endpoint 参数定义 |
| `src/utils/teammateContext.ts` | in-process teammate endpoint context |

### API Client 端点选择逻辑

```typescript
// Anthropic client
let resolvedApiKey = apiKey
let resolvedBaseUrl = undefined

const teammateContext = getTeammateContext()
if (teammateContext?.endpoint) {
  // 优先使用 teammate 指定的端点
  const config = getEndpointConfig(teammateContext.endpoint)
  if (config?.protocol === 'anthropic') {
    resolvedApiKey = config.apiKey
    resolvedBaseUrl = config.baseUrl
  }
} else if (isExtraEndpointsEnabled()) {
  // 使用全局端点配置
  const endpoint = loadCurrentEndpoint()
  ...
}
```

## 未来计划

- [ ] 支持 tmux/iTerm2 teammate 的端点差异化（需要在 spawn 时动态注入环境变量）
- [ ] 支持端点健康检查和自动切换
- [ ] 支持端点级别的模型映射配置