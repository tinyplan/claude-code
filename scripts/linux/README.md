# Linux 启动脚本

本目录包含 Linux 平台下通过 `claude --settings` 启动 Claude Code 的 Shell 脚本。

## 文件说明

| 文件 | 说明 |
|------|------|
| `run-ccb.sh` | Shell 启动脚本，在新终端窗口中启动 Claude Code（依赖 Bun 运行时） |
| `run-ccb-exe.sh` | Shell 启动脚本，使用预编译的 `ccb` 可执行文件启动（无需 Bun） |

## 启动方式

### 方式一：使用 Bun 运行（run-ccb.sh）

需要安装 Bun 运行时并设置 `CCB_HOME` 环境变量。

#### 1. 准备 settings 配置文件

参考 [settings 模板](#settings-配置格式)，创建一个 settings 文件。

#### 2. 设置环境变量

脚本依赖 `CCB_HOME` 环境变量定位 Claude Code 安装路径：

```bash
# 临时设置（当前会话）
export CCB_HOME=/path/to/claude-code

# 永久设置（用户级别，添加到 ~/.bashrc 或 ~/.zshrc）
echo 'export CCB_HOME=/path/to/claude-code' >> ~/.bashrc
source ~/.bashrc
```

#### 3. 运行脚本

```bash
# 添加可执行权限
chmod +x run-ccb.sh

# 使用指定配置名启动（自动寻找脚本同级目录下的 ccb-settings/{配置名}/settings.json）
./run-ccb.sh custom

# 传递额外参数
./run-ccb.sh custom --debug
```

### 方式二：使用可执行文件（run-ccb-exe.sh）

无需 Bun 运行时，适合已构建发布后的快速部署。

#### 1. 准备可执行文件

将构建后的 `ccb` 放在脚本同级目录：

```
scripts/linux/
├── ccb                  ← 必须存在
├── run-ccb.sh
├── run-ccb-exe.sh
└── ccb-settings/
    └── custom/
        └── settings.json
```

#### 2. 运行脚本

```bash
# 添加可执行权限
chmod +x run-ccb-exe.sh

# 使用指定配置名启动
./run-ccb-exe.sh custom

# 传递额外参数
./run-ccb-exe.sh custom --debug
```

## 参数说明

| 参数 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `ConfigName` | 是 | 无 | settings 配置名，脚本自动寻找同级目录下的 `ccb-settings/{配置名}/settings.json` |
| `Arguments` | 否 | 无 | 传递给 Claude Code 的额外参数 |

## 前置依赖

### run-ccb.sh（Bun 模式）

- **Bun** — JavaScript 运行时，[安装指南](https://bun.sh/)
- **CCB_HOME** — 环境变量，指向 Claude Code 项目根目录
- **settings 配置文件** — 用户自行维护，格式见下方

### run-ccb-exe.sh（exe 模式）

- **ccb** — 预编译的可执行文件，需放在脚本同级目录
- **settings 配置文件** — 用户自行维护，格式见下方

## 终端支持

脚本会自动检测以下图形终端（按优先级）：

1. `gnome-terminal` — GNOME 桌面默认终端
2. `konsole` — KDE 桌面默认终端
3. `xterm` — X11 标准终端
4. `alacritty` — 现代 GPU 加速终端

如果未检测到图形终端，脚本将在当前终端运行。

## 注意事项

### 脚本编码要求

`.sh` 文件必须使用 **UTF-8** 编码保存，行尾为 LF（Unix 格式）。

### 脚本权限

首次使用需添加可执行权限：

```bash
chmod +x run-ccb.sh run-ccb-exe.sh
```

### 可执行文件权限

`ccb` 文件同样需要可执行权限，脚本会自动检测并添加：

```bash
chmod +x ccb
```

## settings 配置格式

`--settings` 接受的配置结构如下，用户自行维护：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "your-api-endpoint",
    "ANTHROPIC_AUTH_TOKEN": "your-api-auth-token",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "my-model",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "my-model",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "my-model",
    "CLAUDE_CODE_EXTRA_BODY": {
      "temperature": 0.7,
      "top_p": 0.9,
      "max_tokens": 4096
    }
  },
  "modelType": "anthropic",
  "model": "opus"
}
```

### 字段说明

- `env` — 环境变量映射
- `modelType` — 模型提供商类型
- `model` — 默认模型名称
- `extraKnownMarketplaces` — 额外插件市场配置