<#
.SYNOPSIS
    Pre-compaction memory flush hook for Titan Memory
.DESCRIPTION
    Automatically saves important context before Claude Code compacts its context window.
    This prevents loss of critical insights, decisions, and solutions.
.NOTES
    Place in ~/.claude/hooks/ and configure in settings.json
#>

param(
    [string]$SessionId = (New-Guid).Guid,
    [string]$Context = ""
)

$ErrorActionPreference = "SilentlyContinue"

# Paths
$TitanDir = Join-Path $env:USERPROFILE ".claude\titan-memory"
$NodePath = "node"
$TitanCli = Join-Path $TitanDir "dist\cli\index.js"

# Important pattern matchers
$Patterns = @{
    Decision = "(?i)(decided|decision|chose|choosing|went with|picked|selected)"
    Error = "(?i)(error|bug|issue|problem|failed|failure|exception|crash)"
    Solution = "(?i)(fixed|solved|resolved|solution|workaround|fix was|the fix)"
    Learning = "(?i)(learned|discovered|realized|insight|understood|found that)"
    Architecture = "(?i)(architecture|design|pattern|structure|approach|strategy)"
    Preference = "(?i)(prefer|like|dislike|want|need|should always|never)"
}

function Extract-Insights {
    param([string]$Text)

    $insights = @{
        decisions = @()
        errors = @()
        solutions = @()
        learnings = @()
    }

    $lines = $Text -split "`n"

    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if ($trimmed.Length -lt 10) { continue }

        if ($trimmed -match $Patterns.Decision) {
            $insights.decisions += $trimmed
        }
        if ($trimmed -match $Patterns.Error) {
            $insights.errors += $trimmed
        }
        if ($trimmed -match $Patterns.Solution) {
            $insights.solutions += $trimmed
        }
        if ($trimmed -match $Patterns.Learning) {
            $insights.learnings += $trimmed
        }
    }

    return $insights
}

# Main execution
try {
    # Check if Titan is built
    if (-not (Test-Path $TitanCli)) {
        Write-Host "Titan Memory not built. Run: cd ~/.claude/titan-memory && npm install && npm run build"
        exit 0
    }

    # Extract insights from context
    $insights = Extract-Insights -Text $Context

    # Count total insights
    $totalInsights = $insights.decisions.Count + $insights.errors.Count + $insights.solutions.Count + $insights.learnings.Count

    if ($totalInsights -eq 0) {
        Write-Host "No significant insights to flush"
        exit 0
    }

    # Build flush command
    $args = @("flush")

    if ($insights.decisions.Count -gt 0) {
        $decisions = ($insights.decisions | Select-Object -First 5) -join ","
        $args += "-d", "`"$decisions`""
    }

    if ($insights.errors.Count -gt 0) {
        $errors = ($insights.errors | Select-Object -First 5) -join ","
        $args += "-e", "`"$errors`""
    }

    if ($insights.solutions.Count -gt 0) {
        $solutions = ($insights.solutions | Select-Object -First 5) -join ","
        $args += "-s", "`"$solutions`""
    }

    if ($insights.learnings.Count -gt 0) {
        $learnings = ($insights.learnings | Select-Object -First 5) -join ","
        $args += "-i", "`"$learnings`""
    }

    # Execute Titan flush
    $result = & $NodePath $TitanCli @args 2>&1

    Write-Host "Titan Memory: Flushed $totalInsights insights before compaction"
    Write-Host $result

} catch {
    Write-Host "Titan Memory flush error: $_"
}

exit 0
