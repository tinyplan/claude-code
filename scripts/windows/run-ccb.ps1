param(
    [Parameter(Mandatory=$false)]
    [string]$Provider = "custom",

    [Parameter(Mandatory=$false)]
    [string]$ConfigFile = "$PSScriptRoot\config.json",
    
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Arguments
)

$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

# 检查配置文件是否存在
if (-not (Test-Path $ConfigFile)) {
    Write-Host "错误: 配置文件不存在 '$ConfigFile'" -ForegroundColor Red
    exit 1
}

try {
    # 读取配置文件
    $Config = Get-Content -Path $ConfigFile -Raw | ConvertFrom-Json
}
catch {
    Write-Host "错误: 无法解析配置文件 '$ConfigFile' - $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 获取默认提供商或使用参数指定的提供商
if ([string]::IsNullOrEmpty($Provider)) {
    $Provider = $Config.default_provider
    if ([string]::IsNullOrEmpty($Provider)) {
        Write-Host "错误: 未指定提供商且配置文件中没有默认提供商" -ForegroundColor Red
        exit 1
    }
}

# 验证提供商是否存在于配置中
if (-not $Config.providers.$Provider) {
    Write-Host "错误: 配置文件中不存在提供商 '$Provider'" -ForegroundColor Red
    Write-Host "可用的提供商: $($Config.providers.PSObject.Properties.Name -join ', ')" -ForegroundColor Yellow
    exit 1
}

$jsFilePath = "$($env:CCB_HOME)\dist\cli-bun.js"

if (-not (Test-Path $jsFilePath)) {
    Write-Host "错误: 路径不存在 '$jsFilePath'" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Host "错误: bun不存在" -ForegroundColor Red
    exit 1
}

# 获取提供商配置
$providerConfig = $Config.providers.$Provider

# 设置环境变量
$ANTHROPIC_BASE_URL = `
    $(if ($env:ANTHROPIC_BASE_URL) { $env:ANTHROPIC_BASE_URL } else { $providerConfig.ANTHROPIC_BASE_URL })
$ANTHROPIC_AUTH_TOKEN = `
    $(if ($env:ANTHROPIC_AUTH_TOKEN) { $env:ANTHROPIC_AUTH_TOKEN } else { $providerConfig.ANTHROPIC_AUTH_TOKEN })
$ANTHROPIC_DEFAULT_HAIKU_MODEL = `
    $(if ($env:ANTHROPIC_DEFAULT_HAIKU_MODEL) { $env:ANTHROPIC_DEFAULT_HAIKU_MODEL } else { $providerConfig.ANTHROPIC_DEFAULT_HAIKU_MODEL })
$ANTHROPIC_DEFAULT_SONNET_MODEL = `
    $(if ($env:ANTHROPIC_DEFAULT_SONNET_MODEL) { $env:ANTHROPIC_DEFAULT_SONNET_MODEL } else { $providerConfig.ANTHROPIC_DEFAULT_SONNET_MODEL })
$ANTHROPIC_DEFAULT_OPUS_MODEL = `
    $(if ($env:ANTHROPIC_DEFAULT_OPUS_MODEL) { $env:ANTHROPIC_DEFAULT_OPUS_MODEL } else { $providerConfig.ANTHROPIC_DEFAULT_OPUS_MODEL })

# 处理 CLAUDE_CODE_EXTRA_BODY（JSON 对象转字符串）
$CLAUDE_CODE_EXTRA_BODY = ""
if ($env:CLAUDE_CODE_EXTRA_BODY) {
    $CLAUDE_CODE_EXTRA_BODY = $env:CLAUDE_CODE_EXTRA_BODY
} elseif ($providerConfig.CLAUDE_CODE_EXTRA_BODY) {
    $CLAUDE_CODE_EXTRA_BODY = $providerConfig.CLAUDE_CODE_EXTRA_BODY | ConvertTo-Json -Compress -Depth 10
}

Write-Host "已选择LLM供应商: $Provider" -ForegroundColor Green

# 构建命令
$startCommand = "Set-Location '$PWD'; " + `
    "`$env:ANTHROPIC_BASE_URL`='$($ANTHROPIC_BASE_URL)'; " + `
    "`$env:ANTHROPIC_AUTH_TOKEN`='$($ANTHROPIC_AUTH_TOKEN)'; " + `
    "`$env:ANTHROPIC_DEFAULT_HAIKU_MODEL`='$($ANTHROPIC_DEFAULT_HAIKU_MODEL)'; " + `
    "`$env:ANTHROPIC_DEFAULT_SONNET_MODEL`='$($ANTHROPIC_DEFAULT_SONNET_MODEL)'; " + `
    "`$env:ANTHROPIC_DEFAULT_OPUS_MODEL`='$($ANTHROPIC_DEFAULT_OPUS_MODEL)'; "

# 如果有 EXTRA_BODY 配置，添加到命令中
if ($CLAUDE_CODE_EXTRA_BODY) {
    $startCommand += "`$env:CLAUDE_CODE_EXTRA_BODY='$($CLAUDE_CODE_EXTRA_BODY)'; "
}

$startCommand += "bun run '$jsFilePath' $($Arguments -join ' ')"

# 新开窗口执行
Start-Process powershell -ArgumentList "-NoExit", "-Command", $startCommand

# 脚本退出
exit 0