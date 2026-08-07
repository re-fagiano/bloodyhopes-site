param(
  [ValidateSet('production', 'staging')]
  [string]$Environment = 'production'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$configFile = if ($Environment -eq 'staging') { 'wrangler.staging.jsonc' } else { 'wrangler.jsonc' }

function ConvertFrom-SecureValue {
  param([Security.SecureString]$Value)

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

Push-Location $projectRoot
try {
  & npx.cmd --yes wrangler@4 whoami | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'Wrangler is not authenticated. Run: npx wrangler login' }

  Write-Host "Configuring Campfire secrets for $Environment."
  Write-Host 'Use a unique token of at least 32 characters and save it in your password manager.'
  $firstSecure = Read-Host 'Campfire admin token' -AsSecureString
  $secondSecure = Read-Host 'Repeat the admin token' -AsSecureString
  $firstPlain = ConvertFrom-SecureValue $firstSecure
  $secondPlain = ConvertFrom-SecureValue $secondSecure

  if ($firstPlain.Length -lt 32) { throw 'The admin token must contain at least 32 characters.' }
  if ($firstPlain -cne $secondPlain) { throw 'The two admin token values do not match.' }

  $firstPlain | npx.cmd --yes wrangler@4 secret put CAMPFIRE_ADMIN_TOKEN --config $configFile
  if ($LASTEXITCODE -ne 0) { throw 'Unable to configure CAMPFIRE_ADMIN_TOKEN.' }

  $saltBytes = New-Object byte[] 48
  $random = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $random.GetBytes($saltBytes)
  } finally {
    $random.Dispose()
  }
  $hashSalt = [Convert]::ToBase64String($saltBytes)
  $hashSalt | npx.cmd --yes wrangler@4 secret put CAMPFIRE_HASH_SALT --config $configFile
  if ($LASTEXITCODE -ne 0) { throw 'Unable to configure CAMPFIRE_HASH_SALT.' }

  Write-Host "Campfire secrets configured for $Environment."
} finally {
  $firstPlain = $null
  $secondPlain = $null
  $hashSalt = $null
  $saltBytes = $null
  Pop-Location
}
