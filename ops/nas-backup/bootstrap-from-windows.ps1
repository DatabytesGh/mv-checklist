# Upload ops/nas-backup to 192.168.1.11 and run install.sh
# Usage:
#   .\bootstrap-from-windows.ps1
#   .\bootstrap-from-windows.ps1 -SshUser ubuntu -NasShare backups

param(
  [string]$Server = "192.168.1.11",
  [string]$SshUser = "",
  [string]$SshPassword = "",
  [string]$NasIp = "192.168.1.136",
  [string]$NasShare = "backups",
  [string]$NasUser = "Databytes",
  [string]$NasPassword = "",
  [string]$IdentityFile = "$env:USERPROFILE\.ssh\id_ed25519_mv_server",
  [string]$RemoteDir = "/tmp/nas-backup-install"
)

if (-not $SshUser -and $env:MV_SSH_USER) { $SshUser = $env:MV_SSH_USER }
if (-not $SshPassword -and $env:MV_SSH_PASSWORD) { $SshPassword = $env:MV_SSH_PASSWORD }
if (-not $NasPassword -and $env:MV_NAS_PASSWORD) { $NasPassword = $env:MV_NAS_PASSWORD }
if (-not $NasShare -and $env:MV_NAS_SHARE) { $NasShare = $env:MV_NAS_SHARE }

$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Plink = "C:\Program Files\PuTTY\plink.exe"
$Pscp = "C:\Program Files\PuTTY\pscp.exe"

if (-not (Test-Path $Plink)) { throw "PuTTY plink not found at $Plink" }
if (-not (Test-Path $Pscp)) { throw "PuTTY pscp not found at $Pscp" }
if (-not (Test-Path $IdentityFile)) { throw "Missing SSH key: $IdentityFile" }

$PubKey = Get-Content "$IdentityFile.pub" -Raw
$PubKey = $PubKey.Trim()

if ([string]::IsNullOrWhiteSpace($SshUser)) {
  $SshUser = Read-Host "SSH username for $Server (e.g. ubuntu, databytes, mayavilla)"
}
if ([string]::IsNullOrWhiteSpace($SshPassword)) {
  $SshSecure = Read-Host "SSH password for ${SshUser}@${Server}" -AsSecureString
  $BSTR1 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SshSecure)
  try { $SshPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR1) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR1) }
}
if ([string]::IsNullOrWhiteSpace($NasPassword)) {
  $NasSecure = Read-Host "Synology NAS password for ${NasUser}@${NasIp}" -AsSecureString
  $BSTR2 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($NasSecure)
  try { $NasPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR2) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR2) }
}

function Invoke-Plink([string]$RemoteCommand) {
  $args = @(
    "-ssh", "-batch",
    "-pw", $SshPassword,
    "${SshUser}@${Server}",
    $RemoteCommand
  )
  & $Plink @args
  if ($LASTEXITCODE -ne 0) { throw "plink failed ($LASTEXITCODE): $RemoteCommand" }
}

Write-Host "==> Accept host key / test login"
& $Plink -ssh -batch -pw $SshPassword "${SshUser}@${Server}" "echo OK && whoami && hostname"
if ($LASTEXITCODE -ne 0) {
  # first connect may need host key acceptance
  echo y | & $Plink -ssh -pw $SshPassword "${SshUser}@${Server}" "echo OK && whoami && hostname"
  if ($LASTEXITCODE -ne 0) { throw "SSH login failed for ${SshUser}@${Server}" }
}

Write-Host "==> Install Cursor ops public key for passwordless SSH"
$authCmd = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && (grep -qxF '$PubKey' ~/.ssh/authorized_keys 2>/dev/null || echo '$PubKey' >> ~/.ssh/authorized_keys) && chmod 600 ~/.ssh/authorized_keys && echo KEY_INSTALLED"
Invoke-Plink $authCmd

# Update local SSH config user
$configPath = "$env:USERPROFILE\.ssh\config"
if (Test-Path $configPath) {
  $cfg = Get-Content $configPath -Raw
  $cfg = $cfg -replace "Host mv-server[\s\S]*?IdentitiesOnly yes", @"
Host mv-server
  HostName 192.168.1.11
  User $SshUser
  IdentityFile ~/.ssh/id_ed25519_mv_server
  IdentitiesOnly yes
"@
  Set-Content -Path $configPath -Value $cfg -NoNewline
}

Write-Host "==> Upload package via pscp"
& $Plink -ssh -batch -pw $SshPassword "${SshUser}@${Server}" "rm -rf $RemoteDir && mkdir -p $RemoteDir"
& $Pscp -batch -pw $SshPassword -r "$Here\*" "${SshUser}@${Server}:${RemoteDir}/"
if ($LASTEXITCODE -ne 0) { throw "pscp upload failed" }

Write-Host "==> Run install.sh (sudo)"
# Single-line remote command avoids PowerShell CRLF breaking bash
$installRemote = "set -e; cd $RemoteDir; sed -i 's/\r$//' *.sh *.conf *.example 2>/dev/null || true; chmod +x *.sh; export NAS_IP='$NasIp'; export NAS_SHARE='$NasShare'; export NAS_USER='$NasUser'; export NAS_PASSWORD='$NasPassword'; export BACKUP_HOST_ID='192.168.1.11'; if sudo -n true 2>/dev/null; then sudo -E bash install.sh; else echo '$SshPassword' | sudo -S -E bash install.sh; fi"

& $Plink -ssh -batch -pw $SshPassword "${SshUser}@${Server}" $installRemote
if ($LASTEXITCODE -ne 0) { throw "install.sh failed on server" }

Write-Host ""
Write-Host "Bootstrap complete."
Write-Host "Try: ssh mv-server"
Write-Host "Then: sudo inventory-apps.sh"
Write-Host "Deploy: sudo deploy-app.sh mv-checklist"
