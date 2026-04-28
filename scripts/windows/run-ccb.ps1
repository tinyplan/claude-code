param(
    [Parameter(Mandatory=$true)]
    [string]$ConfigName,

    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Arguments
)

$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

# 脚本所在目录
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 配置文件路径: ccb-settings/{ConfigName}/settings.json
$ConfigFile = Join-Path $scriptDir "ccb-settings\$ConfigName\settings.json"

# 检查配置文件是否存在
if (-not (Test-Path $ConfigFile)) {
    Write-Host "错误: 配置文件不存在 '$ConfigFile'" -ForegroundColor Red
    exit 1
}

Write-Host "已使用配置: $ConfigFile" -ForegroundColor Green

# 检查 cli 路径
$jsFilePath = "$($env:CCB_HOME)\dist\cli-bun.js"
if (-not (Test-Path $jsFilePath)) {
    Write-Host "错误: 路径不存在 '$jsFilePath'" -ForegroundColor Red
    exit 1
}

# 检查 bun
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Host "错误: bun 不存在" -ForegroundColor Red
    exit 1
}

# 启动命令
$startCommand = "Set-Location '$PWD'; " +
    "bun run '$jsFilePath' --settings '$ConfigFile' $($Arguments -join ' ')"

# 新窗口执行
Start-Process powershell -ArgumentList "-NoExit", "-Command", $startCommand

exit 0
