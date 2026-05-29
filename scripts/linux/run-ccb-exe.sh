#!/bin/bash

# Linux 启动脚本 - exe 文件模式
# 使用预编译的 ccb 可执行文件启动 Claude Code

set -e

# 参数检查
if [ -z "$1" ]; then
    echo "错误: 缺少必需参数 ConfigName"
    echo "用法: ./run-ccb-exe.sh <ConfigName> [额外参数...]"
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

# 检查 ccb 可执行文件是否存在
ExeFilePath="${ScriptDir}/ccb"
if [ ! -f "$ExeFilePath" ]; then
    echo "错误: 可执行文件不存在 '$ExeFilePath'"
    exit 1
fi

# 检查可执行权限
if [ ! -x "$ExeFilePath" ]; then
    echo "提示: 添加可执行权限 chmod +x '$ExeFilePath'"
    chmod +x "$ExeFilePath"
fi

# 启动命令
StartCommand="cd '$PWD' && '$ExeFilePath' --settings '$ConfigFile' $Arguments"

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