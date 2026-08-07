param(
  [Parameter(Mandatory = $true)][string]$BaseUrl,
  [Parameter(Mandatory = $true)][string]$AdminToken
)

$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')
$adminHeaders = @{ Authorization = "Bearer $AdminToken" }
$runId = [guid]::NewGuid().ToString('N')

function Get-Status {
  param([scriptblock]$Request)
  try {
    & $Request | Out-Null
    return 200
  } catch {
    return [int]$_.Exception.Response.StatusCode
  }
}

function Submit-Voice {
  param([hashtable]$Voice)
  Invoke-RestMethod "$BaseUrl/api/campfire/contributions" -Method Post -ContentType 'application/json' -Body ($Voice | ConvertTo-Json)
}

$page = Invoke-WebRequest "$BaseUrl/campfire.html" -UseBasicParsing
if (-not $page.Headers['Content-Security-Policy']) { throw 'Missing Content-Security-Policy header' }
$articlesPage = Invoke-WebRequest "$BaseUrl/articles.html" -UseBasicParsing
if ($articlesPage.StatusCode -ne 200) { throw "Articles page returned $($articlesPage.StatusCode)" }

$privatePaths = @(
  '/worker.js',
  '/scripts/moderate-campfire.ps1',
  '/tests/campfire-staging-smoke.ps1',
  '/wrangler.jsonc',
  '/.github/workflows/deploy.yml',
  '/.git/config',
  '/README.md',
  '/security_best_practices_report.md'
)
foreach ($privatePath in $privatePaths) {
  $privateStatus = Get-Status { Invoke-WebRequest "$BaseUrl$privatePath" -UseBasicParsing }
  if ($privateStatus -ne 404) { throw "Private asset is publicly accessible at ${privatePath}: $privateStatus" }
}

$validVoice = @{
  song = 'the-elephant'
  quoted_line = 'You must see the elephant'
  interpretation = "The refrain makes testimony authoritative while admitting its limits. Smoke test $runId."
  model = 'Bloody Hopes staging test'
  provenance = 'unknown'
}
$accepted = Submit-Voice $validVoice
if ($accepted.status -ne 'pending') { throw 'Valid Voice did not enter pending state' }

$wrongTokenStatus = Get-Status { Invoke-WebRequest "$BaseUrl/api/campfire/moderate" -Headers @{ Authorization = 'Bearer wrong-token' } -UseBasicParsing }
if ($wrongTokenStatus -ne 401) { throw "Wrong admin token returned $wrongTokenStatus" }

$pending = Invoke-RestMethod "$BaseUrl/api/campfire/moderate" -Headers $adminHeaders
if ($accepted.id -notin $pending.voices.id) { throw 'Pending Voice not visible to moderator' }

$approval = @{ id = $accepted.id; status = 'approved' } | ConvertTo-Json
Invoke-RestMethod "$BaseUrl/api/campfire/moderate" -Method Post -Headers $adminHeaders -ContentType 'application/json' -Body $approval | Out-Null
$public = Invoke-RestMethod "$BaseUrl/api/campfire"
if ($accepted.id -notin $public.voices.id) { throw 'Approved Voice not visible publicly' }

$duplicateStatus = Get-Status { Submit-Voice $validVoice }
if ($duplicateStatus -ne 409) { throw "Duplicate returned $duplicateStatus" }

$xssVoice = $validVoice.Clone()
$xssVoice.quoted_line = '<img src=x onerror=alert(1)>'
$xssVoice.interpretation = "Attempted markup injection for smoke test $runId with sufficient length."
$xssStatus = Get-Status { Submit-Voice $xssVoice }
if ($xssStatus -ne 400) { throw "XSS payload returned $xssStatus" }

$extraFieldVoice = $validVoice.Clone()
$extraFieldVoice.extra_field = 'not allowed'
$extraFieldStatus = Get-Status { Submit-Voice $extraFieldVoice }
if ($extraFieldStatus -ne 400) { throw "Undocumented field returned $extraFieldStatus" }

$linkVoice = $validVoice.Clone()
$linkVoice.interpretation = "Promotional content at https://spam.invalid/$runId should never enter moderation."
$linkStatus = Get-Status { Submit-Voice $linkVoice }
if ($linkStatus -ne 400) { throw "Link payload returned $linkStatus" }

$largeBody = '{"song":"the-elephant","quoted_line":"line","interpretation":"' + ('a' * 9000) + '","model":"test","provenance":"unknown"}'
$largeStatus = Get-Status { Invoke-WebRequest "$BaseUrl/api/campfire/contributions" -Method Post -ContentType 'application/json' -Body $largeBody -UseBasicParsing }
if ($largeStatus -ne 413) { throw "Large payload returned $largeStatus" }

$rejectedVoice = $validVoice.Clone()
$rejectedVoice.quoted_line = "Rate limit line $runId"
$rejectedVoice.interpretation = "A second unique staging contribution used to verify rejection and rate limiting. $runId"
$second = Submit-Voice $rejectedVoice
$rejection = @{ id = $second.id; status = 'rejected' } | ConvertTo-Json
Invoke-RestMethod "$BaseUrl/api/campfire/moderate" -Method Post -Headers $adminHeaders -ContentType 'application/json' -Body $rejection | Out-Null
$afterReject = Invoke-RestMethod "$BaseUrl/api/campfire"
if ($second.id -in $afterReject.voices.id) { throw 'Rejected Voice became public' }

$thirdVoice = $validVoice.Clone()
$thirdVoice.quoted_line = "Third accepted line $runId"
$thirdVoice.interpretation = "A third unique staging contribution confirms that duplicates do not consume quota. $runId"
$third = Submit-Voice $thirdVoice
$thirdRejection = @{ id = $third.id; status = 'rejected' } | ConvertTo-Json
Invoke-RestMethod "$BaseUrl/api/campfire/moderate" -Method Post -Headers $adminHeaders -ContentType 'application/json' -Body $thirdRejection | Out-Null

$rateVoice = $validVoice.Clone()
$rateVoice.quoted_line = "Rate limit overflow $runId"
$rateVoice.interpretation = "A fourth accepted-format request must be refused by the daily limiter. $runId"
$rateStatus = Get-Status { Submit-Voice $rateVoice }
if ($rateStatus -ne 429) { throw "Rate limit returned $rateStatus" }

[pscustomobject]@{
  Page = $page.StatusCode
  ArticlesPage = $articlesPage.StatusCode
  PrivateAssets = 'all 404'
  Pending = 202
  WrongToken = $wrongTokenStatus
  ApprovedPublic = $true
  RejectedPrivate = $true
  Duplicate = $duplicateStatus
  XSS = $xssStatus
  ExtraField = $extraFieldStatus
  Link = $linkStatus
  LargePayload = $largeStatus
  RateLimit = $rateStatus
} | Format-List
