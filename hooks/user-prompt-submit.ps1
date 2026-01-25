<#
.SYNOPSIS
    User prompt submit hook with novelty detection for Titan Memory
.DESCRIPTION
    Enhances prompts with relevant context from Titan Memory and
    detects novel queries that should be stored.
.NOTES
    Integrate with existing hooks in ~/.claude/hooks/
#>

param(
    [string]$Prompt = "",
    [string]$SessionId = ""
)

$ErrorActionPreference = "SilentlyContinue"

# Paths
$TitanDir = Join-Path $env:USERPROFILE ".claude\titan-memory"
$NodePath = "node"
$TitanCli = Join-Path $TitanDir "dist\cli\index.js"

# Output structure
$output = @{
    additionalContext = ""
    shouldStore = $false
    noveltyScore = 0
}

function Get-RelevantContext {
    param([string]$Query)

    try {
        if (-not (Test-Path $TitanCli)) {
            return ""
        }

        # Query Titan Memory for relevant context
        $result = & $NodePath $TitanCli recall $Query --limit 3 --json 2>&1 | ConvertFrom-Json

        if ($result.fusedMemories -and $result.fusedMemories.Count -gt 0) {
            $context = @()
            foreach ($memory in $result.fusedMemories) {
                $context += "- $($memory.content.Substring(0, [Math]::Min(200, $memory.content.Length)))"
            }
            return "Relevant context from memory:`n" + ($context -join "`n")
        }
    } catch {
        # Silently fail - don't block the prompt
    }

    return ""
}

function Test-Novelty {
    param([string]$Query)

    # Simple novelty heuristics (full implementation would use Titan's surprise detection)
    $noveltyIndicators = @(
        "new",
        "first time",
        "never before",
        "different approach",
        "alternative",
        "instead of",
        "experiment",
        "try"
    )

    $score = 0
    foreach ($indicator in $noveltyIndicators) {
        if ($Query -match "(?i)\b$indicator\b") {
            $score += 0.15
        }
    }

    # Longer queries tend to be more novel/specific
    $wordCount = ($Query -split "\s+").Count
    if ($wordCount -gt 20) {
        $score += 0.1
    }

    return [Math]::Min(1.0, $score)
}

# Main execution
try {
    if ([string]::IsNullOrEmpty($Prompt)) {
        exit 0
    }

    # Get relevant context from Titan Memory
    $context = Get-RelevantContext -Query $Prompt

    # Check novelty
    $novelty = Test-Novelty -Query $Prompt

    # Build output
    if (-not [string]::IsNullOrEmpty($context)) {
        $output.additionalContext = $context
    }

    if ($novelty -gt 0.3) {
        $output.shouldStore = $true
        $output.noveltyScore = $novelty
        $output.additionalContext += "`n`n[HIGH NOVELTY ($([Math]::Round($novelty * 100))%): Consider storing insights from this query]"
    }

    # Output as JSON for hook integration
    $output | ConvertTo-Json -Compress

} catch {
    # Return empty on error
    @{ additionalContext = ""; shouldStore = $false; noveltyScore = 0 } | ConvertTo-Json -Compress
}

exit 0
