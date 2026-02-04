# Titan Memory - Start Semantic Highlight Sidecar Service
# Runs the Zilliz semantic-highlight-bilingual-v1 model as a local HTTP API on port 8079.
#
# The MCP server automatically calls this service when doing recall.
# If this service isn't running, it gracefully falls back to Voyage embeddings.
#
# Usage:
#   .\start-highlight-service.ps1
#   .\start-highlight-service.ps1 -Port 8079
#   .\start-highlight-service.ps1 -ModelPath "C:\path\to\model"

param(
    [int]$Port = 8079,
    [string]$ModelPath = "$PSScriptRoot\models\semantic-highlight-bilingual-v1"
)

$VenvPython = "$PSScriptRoot\highlight-env\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Error "Python venv not found. Run: uv venv highlight-env && uv pip install --python highlight-env/Scripts/python.exe torch transformers fastapi uvicorn"
    exit 1
}

if (-not (Test-Path $ModelPath)) {
    Write-Error "Model not found at: $ModelPath"
    Write-Error "Download it: highlight-env\Scripts\python.exe -c `"from huggingface_hub import snapshot_download; snapshot_download('zilliz/semantic-highlight-bilingual-v1', local_dir='models/semantic-highlight-bilingual-v1')`""
    exit 1
}

Write-Host "Starting Titan Highlight Service on port $Port..." -ForegroundColor Cyan
Write-Host "Model: $ModelPath" -ForegroundColor Gray
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

& $VenvPython "$PSScriptRoot\highlight-service.py" --port $Port --model-path $ModelPath
