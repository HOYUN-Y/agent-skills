# Install secondbrain-index-sync for Claude Code and Codex on Windows (directory junctions, no admin needed).
# Usage: powershell -ExecutionPolicy Bypass -File install.ps1 [vault_path]
param([string]$Vault)
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
foreach ($d in @("$env:USERPROFILE\.claude\skills", "$env:USERPROFILE\.agents\skills")) {
  New-Item -ItemType Directory -Force -Path $d | Out-Null
  $t = Join-Path $d "secondbrain-index-sync"
  if (Test-Path $t) {
    $item = Get-Item $t -Force
    if (-not $item.LinkType) { Write-Host "skip: $t exists and is not a link (move it away first)"; continue }
    $item.Delete()
  }
  New-Item -ItemType Junction -Path $t -Target $here | Out-Null
  Write-Host "linked: $t -> $here"
}
if ($Vault) {
  $cfg = "$env:USERPROFILE\.config\secondbrain-index-sync"
  New-Item -ItemType Directory -Force -Path $cfg | Out-Null
  $full = [System.IO.Path]::GetFullPath($Vault)
  [System.IO.File]::WriteAllText("$cfg\vault", "$full`n")
  Write-Host "vault: $full"
} else {
  Write-Host "vault not set: ask the agent to set up the second brain, or rerun with install.ps1 <vault_path>"
}
