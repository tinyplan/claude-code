# Windows 启动脚本

本目录包含 Windows 平台下启动 CCB (Claude Code Best) 的 PowerShell 脚本和配置文件示例。

## 文件说明

| 文件 | 说明 |
|------|------|
| `run-ccb.ps1` | PowerShell 启动脚本，在新窗口中启动 CCB |
| `config.example.json` | 配置文件示例，包含多个 LLM 提供商配置 |

## 快速开始

### 1. 创建配置文件

复制示例配置并修改：

```powershell
Copy-Item config.example.json config.json
```

编辑 `config.json`，填写你的 API 密钥和模型信息：

```json
{
  "providers": {
    "aliyun": {
      "ANTHROPIC_BASE_URL": "https://your-api-endpoint",
      "ANTHROPIC_AUTH_TOKEN": "your-api-key",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-3-5-haiku",
      "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4",
      "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4",
      "CLAUDE_CODE_EXTRA_BODY": {
        "temperature": 0.7,
        "top_p": 0.9,
        "max_tokens": 4096
      }
    },
    "custom": {
      "ANTHROPIC_BASE_URL": "http://127.0.0.1:8000",
      "ANTHROPIC_AUTH_TOKEN": "dummy",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL": "local-model",
      "ANTHROPIC_DEFAULT_SONNET_MODEL": "local-model",
      "ANTHROPIC_DEFAULT_OPUS_MODEL": "local-model"
    }
  },
  "default_provider": "custom"
}
```

### 2. 设置环境变量

脚本依赖 `CCB_HOME` 环境变量定位 CCB 安装路径：

```powershell
# 临时设置（当前会话）
$env:CCB_HOME = "C:\path\to\claude-code"

# 永久设置（用户级别）
[Environment]::SetEnvironmentVariable("CCB_HOME", "C:\path\to\claude-code", "User")
```

### 3. 运行脚本

```powershell
# 使用默认提供商启动
.\run-ccb.ps1

# 指定提供商启动
.\run-ccb.ps1 -Provider aliyun

# 指定配置文件路径
.\run-ccb.ps1 -ConfigFile "D:\config\ccb-config.json"

# 传递额外参数给 CCB
.\run-ccb.ps1 -Provider custom --debug --verbose
```

## 参数说明

| 参数 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `-Provider` | 否 | `config.json` 中的 `default_provider` | LLM 提供商名称 |
| `-ConfigFile` | 否 | `config.json` (同目录) | 配置文件路径 |
| `-Arguments` | 否 | 无 | 传递给 CCB 的额外参数 |

## 环境变量优先级

脚本在设置环境变量时遵循以下优先级：

1. **已存在的环境变量** — 如果 `ANTHROPIC_*` 或 `CLAUDE_CODE_EXTRA_BODY` 变量已在系统中设置，脚本会保留它们
2. **配置文件中的值** — 仅当环境变量未设置时，才从配置文件读取

这意味着你可以通过预设环境变量来覆盖配置文件中的值。

## 采样参数配置

通过 `CLAUDE_CODE_EXTRA_BODY` 配置模型的采样参数，支持以下选项：

| 参数 | 说明 | 常见值 |
|------|------|--------|
| `temperature` | 控制输出的随机性 | `0.7` (平衡) / `1.0` (创意) |
| `top_p` | 核采样概率阈值 | `0.9` |
| `top_k` | Top-K 采样 | `40` |
| `max_tokens` | 最大输出 token 数 | `4096` / `8192` |

配置示例：

```json
{
  "providers": {
    "aliyun": {
      "ANTHROPIC_BASE_URL": "https://your-api-endpoint",
      "ANTHROPIC_AUTH_TOKEN": "your-api-key",
      "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4",
      "CLAUDE_CODE_EXTRA_BODY": {
        "temperature": 0.7,
        "top_p": 0.9,
        "top_k": 40,
        "max_tokens": 4096
      }
    }
  },
  "default_provider": "aliyun"
}
```

**说明**：
- 配置文件中以 JSON 对象格式存储
- 脚本运行时自动转换为字符串并设置 `CLAUDE_CODE_EXTRA_BODY` 环境变量
- 不同提供商可配置不同的采样参数

## 前置依赖

- **Bun** — JavaScript 运行时，[安装指南](https://bun.sh/)
- **CCB_HOME** — 环境变量，指向 CCB 项目根目录

## 注意事项

### PowerShell 脚本编码要求

PowerShell 脚本文件（`.ps1`）必须使用 **UTF-8 with BOM** 编码保存。

如果脚本使用无 BOM 的 UTF-8 或其他编码，可能导致：
- 中文字符显示异常
- 脚本执行失败或报错

**解决方案**：使用 VS Code 或其他编辑器，在保存时选择 "UTF-8 with BOM" 编码。

### Windows 执行策略

Windows 默认可能限制脚本执行。运行前请检查并设置执行策略：

```powershell
# 查看当前执行策略
Get-ExecutionPolicy

# 设置执行策略（允许本地脚本运行）
Set-ExecutionPolicy RemoteSigned
```

执行策略说明：
- `Restricted` — 默认值，禁止运行任何脚本
- `RemoteSigned` — 本地脚本可运行，远程脚本需签名
- `Unrestricted` — 所有脚本均可运行（安全性较低，不推荐）

如果不想全局修改，可临时绕过：

```powershell
# 仅对当前会话生效
powershell -ExecutionPolicy Bypass -File .\run-ccb.ps1
```

## 示例场景

### 场景 1：本地模型服务

使用本地运行的模型服务（如 Ollama、vLLM）：

```json
{
  "providers": {
    "local": {
      "ANTHROPIC_BASE_URL": "http://127.0.0.1:8000",
      "ANTHROPIC_AUTH_TOKEN": "dummy",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL": "llama3",
      "ANTHROPIC_DEFAULT_SONNET_MODEL": "llama3",
      "ANTHROPIC_DEFAULT_OPUS_MODEL": "llama3"
    }
  },
  "default_provider": "local"
}
```

### 场景 2：多云提供商切换

配置多个提供商，按需切换：

```powershell
# 日常工作用本地模型
.\run-ccb.ps1 -Provider local

# 需要更强能力时切换云端
.\run-ccb.ps1 -Provider aliyun
```

### 场景 3：调试模式

```powershell
.\run-ccb.ps1 -Provider custom --debug --verbose
```