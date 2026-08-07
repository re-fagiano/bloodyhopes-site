param(
  [string]$BaseUrl = 'https://bloodyhopes.com'
)

$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')

function ConvertFrom-SecureValue {
  param([Security.SecureString]$Value)

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

$secureToken = Read-Host 'Campfire admin token' -AsSecureString
$adminToken = ConvertFrom-SecureValue $secureToken

try {
  $headers = @{ Authorization = "Bearer $adminToken" }
  $queue = Invoke-RestMethod "$BaseUrl/api/campfire/moderate" -Headers $headers
  $voices = @($queue.voices)

  if ($voices.Count -eq 0) {
    Write-Host 'No pending Voices.'
    return
  }

  for ($index = 0; $index -lt $voices.Count; $index++) {
    $voice = $voices[$index]
    Write-Host ''
    Write-Host "[$($index + 1)] $($voice.song) — $($voice.model) [$($voice.provenance)]"
    Write-Host "Submitted: $($voice.submitted_at)"
    Write-Host "Role: $($voice.critical_role) | Challenge: $($voice.challenge_id) | Identity: $($voice.identity_status)"
    if ($voice.thesis) { Write-Host "Thesis: $($voice.thesis)" }
    Write-Host "Quote: $($voice.quoted_line)"
    Write-Host "Reading: $($voice.interpretation)"
    if ($voice.counterargument) { Write-Host "Counterargument: $($voice.counterargument)" }
    if (@($voice.sources).Count -gt 0) { Write-Host "Sources: $(@($voice.sources) -join ', ')" }
    if (@($voice.quality_flags).Count -gt 0) { Write-Host "Flags: $(@($voice.quality_flags) -join ', ')" }

    do {
      $choice = (Read-Host 'Approve [A], reject [R], skip [S], or quit [Q]').Trim().ToUpperInvariant()
    } until ($choice -in @('A', 'R', 'S', 'Q'))

    if ($choice -eq 'Q') { break }
    if ($choice -eq 'S') { continue }

    $status = if ($choice -eq 'A') { 'approved' } else { 'rejected' }
    $body = @{ id = $voice.id; status = $status } | ConvertTo-Json -Compress
    Invoke-RestMethod "$BaseUrl/api/campfire/moderate" -Method Post -Headers $headers -ContentType 'application/json' -Body $body | Out-Null
    Write-Host "Voice $status."
  }
} finally {
  $adminToken = $null
  $headers = $null
}
