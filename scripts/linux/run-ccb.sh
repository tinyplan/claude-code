#!/bin/bash

# Linux 启动脚本 - Bun 运行时模式
# 在新终端窗口中启动 Claude Code

set -e

# 参数检查
if [ -z "$1" ]; then
    echo "错误: 缺少必需参数 ConfigName"
    echo "用法: ./run-ccb.sh <ConfigName> [额外参数...]"
    exit 1
fi

ConfigName="$1"
shift
Arguments="$*"

# 脚本所在目录
ScriptDir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 配置文件路径: ccb-settings/{ConfigName}/settings.json
ConfigFile="${ScriptDir}/ccb-settings/${ConfigName}/settings.json"

# 检查配置文件是否存在
if [ ! -f "$ConfigFile" ]; then
    echo "错误: 配置文件不存在 '$ConfigFile'"
    exit 1
fi

echo "已使用配置: $ConfigFile"

# 检查 CCB_HOME 环境变量
if [ -z "$CCB_HOME" ]; then
    echo "错误: 未设置 CCB_HOME 环境变量"
    echo "请设置: export CCB_HOME=/path/to/claude-code"
    exit 1
fi

# 检查 cli 入口是否存在
CliPath="${CCB_HOME}/src/entrypoints/cli.tsx"
if [ ! -f "$CliPath" ]; then
    echo "错误: CLI 入口不存在 '$CliPath'"
    exit 1
fi

# 检查 bun 是否可用
if ! command -v bun &> /dev/null; then
    echo "错误: 未找到 bun 命令"
    echo "请安装 Bun: https://bun.sh/"
    exit 1
fi

# 启动命令
StartCommand="cd '$PWD' && bun run '${CliPath}' --settings '$ConfigFile' $Arguments"

# 根据可用终端选择启动方式
if command -v gnome-terminal &> /dev/null; then
    gnome-terminal -- bash -c "$StartCommand; exec bash"
elif command -v konsole &> /dev/null; then
    konsole -e bash -c "$StartCommand; exec bash"
elif command -v xterm &> /dev/null; then
    xterm -e bash -c "$StartCommand; exec bash"
elif command -v alacritty &> /dev/null; then
    alacritty -e bash -c "$StartCommand; exec bash"
else
    echo "警告: 未检测到图形终端，在当前终端运行"
    eval "$StartCommand"
fi

exit 0