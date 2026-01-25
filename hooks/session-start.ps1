<#
.SYNOPSIS
    Session start hook for Titan Memory
.DESCRIPTION
    Initializes Titan Memory for a new session and loads relevant context.
#>

param(
    [string]$SessionId = (New-Guid).Guid,
    [string]$ProjectId = ""
)

$ErrorActionPreference = "SilentlyContinue"

# Paths
$TitanDir = Join-Path $env:USERPROFILE ".claude\titan-memory"
$NodePath = "node"
$TitanCli = Join-Path $TitanDir "dist\cli\index.js"

try {
    if (-not (Test-Path $TitanCli)) {
        Write-Host "Titan Memory: Not installed. Run setup first."
        exit 0
    }

    # Get yesterday's summary for context
    $yesterday = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")
    $summary = & $NodePath $TitanCli summary $yesterday 2>&1

    # Get today's entries so far
    $today = & $NodePath $TitanCli today 2>&1

    # Get memory stats
    $stats = & $NodePath $TitanCli stats --json 2>&1 | ConvertFrom-Json

    Write-Host "Titan Memory initialized"
    Write-Host "  Total memories: $($stats.stats.totalMemories)"
    Write-Host "  Current momentum: $([Math]::Round($stats.stats.avgSurpriseScore * 100))%"

    # Store session start marker
    $null = & $NodePath $TitanCli add "Session started: $SessionId" -l episodic -t "session,start" 2>&1

} catch {
    Write-Host "Titan Memory: Session start error: $_"
}

exit 0
