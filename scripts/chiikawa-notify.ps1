<#
.SYNOPSIS
    Chiikawa Companion CLI Notification Sender for Windows PowerShell
.EXAMPLE
    .\chiikawa-notify.ps1 -State success -Message "Task finished!" -Source "claude-code"
    .\chiikawa-notify.ps1 alert "Please approve deployment"
#>

[CmdletBinding()]
param (
    [Parameter(Position = 0, Mandatory = $true)]
    [ValidateSet("idle", "thinking", "success", "alert", "error")]
    [string]$State = "idle",

    [Parameter(Position = 1, Mandatory = $true)]
    [string]$Message,

    [Parameter(Position = 2)]
    [string]$Source = "terminal",

    [Parameter()]
    [int]$DurationMs = 0,

    [Parameter()]
    [switch]$Sticky,

    [Parameter()]
    [string]$Sound = "",

    [Parameter()]
    [string[]]$Options = @()
)

try {
    if ([string]::IsNullOrWhiteSpace($Message)) {
        exit 0
    }

    $configPath = Join-Path $env:APPDATA "chiikawa-companion\chiikawa-config.json"
    if (-not (Test-Path $configPath)) {
        exit 0
    }

    $config = Get-Content -Raw -Path $configPath | ConvertFrom-Json
    if (-not $config.token) {
        exit 0
    }

    $port = if ($config.port) { $config.port } else { 7788 }
    $token = $config.token

    $body = @{
        state = $State
        message = $Message
        source = $Source
        sticky = $Sticky.IsPresent
    }

    if ($DurationMs -gt 0) {
        $body["duration_ms"] = $DurationMs
    }

    if (-not [string]::IsNullOrWhiteSpace($Sound)) {
        $body["sound"] = $Sound
    }

    if ($Options -and $Options.Count -gt 0) {
        $body["options"] = $Options
    }

    $jsonBody = $body | ConvertTo-Json -Compress

    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type"  = "application/json"
    }

    $uri = "http://127.0.0.1:$port/notify"

    # Send with 2-second timeout, completely silent on error so agent never fails
    $null = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $jsonBody -TimeoutSec 2 -ErrorAction SilentlyContinue
}
catch {
    # Suppress all errors
}
