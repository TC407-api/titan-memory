<#
.SYNOPSIS
    Install Titan Memory hooks into Claude Code
.DESCRIPTION
    Copies hooks to the Claude Code hooks directory and updates settings.json
#>

$ErrorActionPreference = "Stop"

$ClaudeHooksDir = Join-Path $env:USERPROFILE ".claude\hooks"
$TitanHooksDir = Join-Path $env:USERPROFILE ".claude\titan-memory\hooks"
$SettingsPath = Join-Path $env:USERPROFILE ".claude\settings.json"

# Ensure hooks directory exists
if (-not (Test-Path $ClaudeHooksDir)) {
    New-Item -ItemType Directory -Path $ClaudeHooksDir -Force | Out-Null
}

# Copy hooks
$hookFiles = @(
    "pre-compaction.ps1",
    "user-prompt-submit.ps1",
    "post-response.ps1",
    "session-start.ps1"
)

foreach ($hook in $hookFiles) {
    $source = Join-Path $TitanHooksDir $hook
    $dest = Join-Path $ClaudeHooksDir "titan-$hook"

    if (Test-Path $source) {
        Copy-Item $source $dest -Force
        Write-Host "Installed: $hook"
    }
}

# Update settings.json to include hooks
if (Test-Path $SettingsPath) {
    $settings = Get-Content $SettingsPath | ConvertFrom-Json

    # Add Titan hooks to existing hooks configuration
    if (-not $settings.hooks) {
        $settings | Add-Member -NotePropertyName "hooks" -NotePropertyValue @{} -Force
    }

    # Pre-compaction hook
    $settings.hooks | Add-Member -NotePropertyName "preCompaction" -NotePropertyValue @{
        command = "powershell"
        args = @("-File", (Join-Path $ClaudeHooksDir "titan-pre-compaction.ps1"))
    } -Force

    # User prompt submit hook (integrate with existing)
    if (-not $settings.hooks.userPromptSubmit) {
        $settings.hooks | Add-Member -NotePropertyName "userPromptSubmit" -NotePropertyValue @() -Force
    }

    $titanPromptHook = @{
        command = "powershell"
        args = @("-File", (Join-Path $ClaudeHooksDir "titan-user-prompt-submit.ps1"))
    }

    # Add if not already present
    $existing = $settings.hooks.userPromptSubmit | Where-Object { $_.args -contains "titan-user-prompt-submit.ps1" }
    if (-not $existing) {
        $settings.hooks.userPromptSubmit += $titanPromptHook
    }

    # Save settings
    $settings | ConvertTo-Json -Depth 10 | Set-Content $SettingsPath
    Write-Host "Updated settings.json with Titan hooks"
}

Write-Host ""
Write-Host "Titan Memory hooks installed successfully!"
Write-Host ""
Write-Host "Hooks installed:"
Write-Host "  - titan-pre-compaction.ps1 (saves context before compaction)"
Write-Host "  - titan-user-prompt-submit.ps1 (adds relevant memory context)"
Write-Host "  - titan-post-response.ps1 (auto-captures insights)"
Write-Host "  - titan-session-start.ps1 (initializes session)"
Write-Host ""
Write-Host "Note: You may need to manually configure some hooks in ~/.claude/settings.json"
