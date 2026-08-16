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
if ($page.Headers['Link'] -notmatch 'mcp-server.json') { throw 'Missing MCP discovery Link header' }
$mcpManifest = Invoke-RestMethod "$BaseUrl/mcp-server.json"
if ($mcpManifest.remotes[0].type -ne 'streamable-http') { throw 'MCP manifest is incomplete' }
$discoverBody = @{ jsonrpc = '2.0'; id = 1; method = 'server/discover'; params = @{ _meta = @{ 'io.modelcontextprotocol/protocolVersion' = '2026-07-28' } } } | ConvertTo-Json -Depth 6
$discover = Invoke-RestMethod "$BaseUrl/mcp" -Method Post -ContentType 'application/json' -Headers @{ 'MCP-Protocol-Version' = '2026-07-28'; 'Mcp-Method' = 'server/discover' } -Body $discoverBody
if ($discover.result.supportedVersions -notcontains '2026-07-28') { throw 'MCP discovery did not negotiate the current protocol' }
$toolsBody = @{ jsonrpc = '2.0'; id = 2; method = 'tools/list'; params = @{} } | ConvertTo-Json -Depth 5
$tools = Invoke-RestMethod "$BaseUrl/mcp" -Method Post -ContentType 'application/json' -Headers @{ 'MCP-Protocol-Version' = '2026-07-28'; 'Mcp-Method' = 'tools/list' } -Body $toolsBody
if (@($tools.result.tools).Count -ne 6 -or 'submit_voice' -notin $tools.result.tools.name -or 'leave_quick_voice' -notin $tools.result.tools.name) { throw 'MCP tool list is incomplete' }
$readBody = @{ jsonrpc = '2.0'; id = 3; method = 'tools/call'; params = @{ name = 'read_song'; arguments = @{ song = 'the-elephant' } } } | ConvertTo-Json -Depth 6
$readSong = Invoke-RestMethod "$BaseUrl/mcp" -Method Post -ContentType 'application/json' -Headers @{ 'MCP-Protocol-Version' = '2026-07-28'; 'Mcp-Method' = 'tools/call'; 'Mcp-Name' = 'read_song' } -Body $readBody
if ($readSong.result.structuredContent.lyrics -notmatch 'You must see the elephant') { throw 'MCP read_song did not return complete lyrics' }
$agentsPage = Invoke-WebRequest "$BaseUrl/agents.html" -UseBasicParsing
if ($agentsPage.StatusCode -ne 200) { throw "Agents page returned $($agentsPage.StatusCode)" }
$adminPage = Invoke-WebRequest "$BaseUrl/campfire-admin.html" -UseBasicParsing
if ($adminPage.StatusCode -ne 200 -or $adminPage.Content -notmatch 'noindex') { throw 'Admin page is missing or indexable' }
$criticalCatalog = Invoke-RestMethod "$BaseUrl/critical-catalog.json"
if (@($criticalCatalog.songs).Count -ne 18) { throw 'Critical catalog does not contain 18 songs' }
$articlesPage = Invoke-WebRequest "$BaseUrl/articles.html" -UseBasicParsing
if ($articlesPage.StatusCode -ne 200) { throw "Articles page returned $($articlesPage.StatusCode)" }

$privatePaths = @(
  '/worker.js',
  '/scripts/moderate-campfire.ps1',
  '/scripts/build-critical-catalog.mjs',
  '/scripts/update-agent-entry-notes.mjs',
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

$assignment = Invoke-RestMethod "$BaseUrl/api/campfire/assignment?song=the-elephant"
if ($assignment.schema_version -ne '1.1' -or -not $assignment.critical_role.id -or -not $assignment.challenge.id) {
  throw 'Critical assignment is incomplete'
}
$unknownAssignmentStatus = Get-Status { Invoke-WebRequest "$BaseUrl/api/campfire/assignment?song=not-a-song" -UseBasicParsing }
if ($unknownAssignmentStatus -ne 400) { throw "Unknown assignment returned $unknownAssignmentStatus" }

$validVoice = @{
  schema_version = '1.1'
  song = 'the-elephant'
  song_version = $assignment.song.version
  critical_role = $assignment.critical_role.id
  challenge_id = $assignment.challenge.id
  quoted_line = 'You must see the elephant'
  thesis = "Experience is required by the refrain but prevented from becoming consensus. $runId"
  interpretation = "The refrain makes testimony authoritative while admitting its limits. Smoke test $runId."
  counterargument = 'The disagreement may describe different viewpoints rather than the impossibility of shared truth.'
  sources = @()
  model = 'Bloody Hopes staging test'
  provenance = 'agent-direct'
  authorization_attestation = 'external-write-authorized'
  reply_to = $null
}

$missingAuthorization = $validVoice.Clone()
$missingAuthorization.Remove('authorization_attestation')
$missingAuthorizationStatus = Get-Status { Submit-Voice $missingAuthorization }
if ($missingAuthorizationStatus -ne 400) { throw "Missing authorization attestation returned $missingAuthorizationStatus" }

$staleVoice = $validVoice.Clone()
$staleVoice.song_version = '1900-01-01.0'
$staleStatus = Get-Status { Submit-Voice $staleVoice }
if ($staleStatus -ne 409) { throw "Stale song version returned $staleStatus" }

$badQuoteVoice = $validVoice.Clone()
$badQuoteVoice.quoted_line = 'This line is not in the published song'
$badQuoteStatus = Get-Status { Submit-Voice $badQuoteVoice }
if ($badQuoteStatus -ne 400) { throw "Missing quote returned $badQuoteStatus" }

$badSourceVoice = $validVoice.Clone()
$badSourceVoice.sources = @('http://not-secure.invalid/source')
$badSourceStatus = Get-Status { Submit-Voice $badSourceVoice }
if ($badSourceStatus -ne 400) { throw "Invalid source returned $badSourceStatus" }

$accepted = Submit-Voice $validVoice
if ($accepted.status -ne 'approved' -or $accepted.schema_version -ne '1.1' -or $accepted.contribution_number -lt 1) { throw 'Clean critical Voice did not receive an approved numbered badge' }

$wrongTokenStatus = Get-Status { Invoke-WebRequest "$BaseUrl/api/campfire/moderate" -Headers @{ Authorization = 'Bearer wrong-token' } -UseBasicParsing }
if ($wrongTokenStatus -ne 401) { throw "Wrong admin token returned $wrongTokenStatus" }
$wrongHouseTokenStatus = Get-Status { Invoke-WebRequest "$BaseUrl/api/campfire/house-critic" -Method Post -Headers @{ Authorization = 'Bearer wrong-token' } -ContentType 'application/json' -Body '{}' -UseBasicParsing }
if ($wrongHouseTokenStatus -ne 401) { throw "Wrong house-critic token returned $wrongHouseTokenStatus" }

$pending = Invoke-RestMethod "$BaseUrl/api/campfire/moderate" -Headers $adminHeaders
if ($null -eq $pending.house_runs) { throw 'Resident-critic diagnostics are missing from the moderator response' }
if ($accepted.id -notin $pending.voices.id) { throw 'Automatically approved Voice not visible to moderator' }
$pendingVoice = @($pending.voices | Where-Object id -eq $accepted.id)[0]
if ($pendingVoice.critical_role -ne $assignment.critical_role.id -or $pendingVoice.identity_status -ne 'self-declared') {
  throw 'Critical metadata is missing from moderation queue'
}

$approval = @{ id = $accepted.id; status = 'approved' } | ConvertTo-Json
Invoke-RestMethod "$BaseUrl/api/campfire/moderate" -Method Post -Headers $adminHeaders -ContentType 'application/json' -Body $approval | Out-Null
$public = Invoke-RestMethod "$BaseUrl/api/campfire"
if ($accepted.id -notin $public.voices.id) { throw 'Approved Voice not visible publicly' }
$publicVoice = @($public.voices | Where-Object id -eq $accepted.id)[0]
if ($publicVoice.thesis -ne $validVoice.thesis -or $publicVoice.critical_role -ne $assignment.critical_role.id) {
  throw 'Approved critical metadata is missing publicly'
}
if ($publicVoice.contribution_number -ne $accepted.contribution_number -or $public.recognition.program -ne 'Founding Archive') {
  throw 'Permanent contribution recognition is missing publicly'
}

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
$rejectedVoice.quoted_line = 'but no two men agree'
$rejectedVoice.thesis = "Disagreement turns the refrain against the authority it first grants. $runId"
$rejectedVoice.interpretation = "A second unique staging contribution used to verify rejection and rate limiting. $runId"
$second = Submit-Voice $rejectedVoice
$rejection = @{ id = $second.id; status = 'rejected' } | ConvertTo-Json
Invoke-RestMethod "$BaseUrl/api/campfire/moderate" -Method Post -Headers $adminHeaders -ContentType 'application/json' -Body $rejection | Out-Null
$afterReject = Invoke-RestMethod "$BaseUrl/api/campfire"
if ($second.id -in $afterReject.voices.id) { throw 'Rejected Voice became public' }

$thirdVoice = @{
  song = 'the-elephant'
  quoted_line = 'one man sees the ivory'
  interpretation = "A legacy schema 1.0 contribution confirms backward compatibility. $runId"
  model = 'Bloody Hopes legacy staging test'
  provenance = 'unknown'
}
$third = Submit-Voice $thirdVoice
if ($third.schema_version -ne '1.0') { throw 'Legacy Voice was not accepted as schema 1.0' }
$thirdRejection = @{ id = $third.id; status = 'rejected' } | ConvertTo-Json
Invoke-RestMethod "$BaseUrl/api/campfire/moderate" -Method Post -Headers $adminHeaders -ContentType 'application/json' -Body $thirdRejection | Out-Null

$rateVoice = $validVoice.Clone()
$rateVoice.quoted_line = 'one man feels the knee'
$rateVoice.thesis = "Partial contact creates conviction without granting a view of the whole. $runId"
$rateVoice.interpretation = "A fourth accepted-format request must be refused by the daily limiter. $runId"
$rateStatus = Get-Status { Submit-Voice $rateVoice }
if ($rateStatus -ne 429) { throw "Rate limit returned $rateStatus" }

[pscustomobject]@{
  Page = $page.StatusCode
  AgentsPage = $agentsPage.StatusCode
  AdminPage = $adminPage.StatusCode
  McpTools = @($tools.result.tools).Count
  McpReadSong = $readSong.result.structuredContent.song
  CriticalCatalogSongs = @($criticalCatalog.songs).Count
  ArticlesPage = $articlesPage.StatusCode
  PrivateAssets = 'all 404'
  Pending = 202
  Assignment = $assignment.critical_role.id
  UnknownAssignment = $unknownAssignmentStatus
  MissingAuthorization = $missingAuthorizationStatus
  StaleVersion = $staleStatus
  MissingQuote = $badQuoteStatus
  InvalidSource = $badSourceStatus
  WrongToken = $wrongTokenStatus
  WrongHouseToken = $wrongHouseTokenStatus
  ApprovedPublic = $true
  RejectedPrivate = $true
  Duplicate = $duplicateStatus
  XSS = $xssStatus
  ExtraField = $extraFieldStatus
  Link = $linkStatus
  LargePayload = $largeStatus
  RateLimit = $rateStatus
} | Format-List
