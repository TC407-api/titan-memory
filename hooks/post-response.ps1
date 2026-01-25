<#
.SYNOPSIS
    Post-response hook for auto-capturing learnings to Titan Memory
.DESCRIPTION
    Analyzes Claude's response for important patterns and automatically
    stores them in Titan Memory with surprise-based filtering.
.NOTES
    Runs after Claude generates a response
#>

param(
    [string]$Response = "",
    [string]$Prompt = "",
    [string]$SessionId = "",
    [string]$ProjectId = ""
)

$ErrorActionPreference = "SilentlyContinue"

# Paths
$TitanDir = Join-Path $env:USERPROFILE ".claude\titan-memory"
$NodePath = "node"
$TitanCli = Join-Path $TitanDir "dist\cli\index.js"

# Patterns worth capturing
$CapturePatterns = @{
    # Solutions to problems
    Solution = @{
        Pattern = "(?i)(the solution|to fix this|the fix is|resolved by|solved by|workaround is)"
        Priority = "high"
        Tags = "solution,auto-captured"
    }
    # Errors and their causes
    ErrorCause = @{
        Pattern = "(?i)(the error (was|is) caused by|because of|due to|the issue is|the problem is)"
        Priority = "high"
        Tags = "error,cause,auto-captured"
    }
    # Architecture decisions
    Architecture = @{
        Pattern = "(?i)(the architecture|design pattern|we should use|better approach|recommended approach)"
        Priority = "medium"
        Tags = "architecture,auto-captured"
    }
    # Code patterns
    CodePattern = @{
        Pattern = "(?i)(best practice|pattern for|idiomatic way|convention is)"
        Priority = "medium"
        Tags = "pattern,code,auto-captured"
    }
    # Learnings
    Learning = @{
        Pattern = "(?i)(important to note|key takeaway|remember that|keep in mind)"
        Priority = "medium"
        Tags = "learning,auto-captured"
    }
}

function Extract-Captures {
    param([string]$Text)

    $captures = @()

    foreach ($name in $CapturePatterns.Keys) {
        $pattern = $CapturePatterns[$name]

        # Find sentences matching the pattern
        $matches = [regex]::Matches($Text, "([^.]*$($pattern.Pattern)[^.]*\.)")

        foreach ($match in $matches) {
            $sentence = $match.Groups[1].Value.Trim()
            if ($sentence.Length -gt 20 -and $sentence.Length -lt 500) {
                $captures += @{
                    Content = $sentence
                    Type = $name
                    Priority = $pattern.Priority
                    Tags = $pattern.Tags
                }
            }
        }
    }

    return $captures
}

# Main execution
try {
    if ([string]::IsNullOrEmpty($Response)) {
        exit 0
    }

    # Check if Titan is available
    if (-not (Test-Path $TitanCli)) {
        exit 0
    }

    # Extract capturable content
    $captures = Extract-Captures -Text $Response

    # Filter to high priority or limit
    $toStore = $captures | Where-Object { $_.Priority -eq "high" } | Select-Object -First 3
    if ($toStore.Count -eq 0) {
        $toStore = $captures | Select-Object -First 2
    }

    # Store in Titan Memory
    foreach ($capture in $toStore) {
        $content = "[$($capture.Type)] $($capture.Content)"
        $tags = $capture.Tags

        # Add with tags (Titan will handle surprise filtering)
        $null = & $NodePath $TitanCli add $content -t $tags -p $ProjectId 2>&1
    }

    if ($toStore.Count -gt 0) {
        Write-Host "Titan Memory: Auto-captured $($toStore.Count) insights"
    }

} catch {
    # Silently fail - don't disrupt the flow
}

exit 0
