param(
  [switch]$SkipInitialization
)

$ErrorActionPreference = "Stop"
$ProjectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$EnvironmentFile = Join-Path $ProjectDirectory ".env.server"
$ComposeFile = Join-Path $ProjectDirectory "docker-compose.server.yml"
Set-Location $ProjectDirectory

function New-HexSecret([int]$ByteCount = 32) {
  $bytes = New-Object byte[] $ByteCount
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  return ([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
}

function ConvertTo-Base64Url([byte[]]$Bytes) {
  return [Convert]::ToBase64String($Bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function New-AuthToken([string]$Role, [string]$Secret) {
  $utf8 = [Text.Encoding]::UTF8
  $header = ConvertTo-Base64Url ($utf8.GetBytes('{"alg":"HS256","typ":"JWT"}'))
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $expiresAt = $now + (10 * 365 * 24 * 60 * 60)
  $payloadJson = @{ role = $Role; iss = "saluni-server"; iat = $now; exp = $expiresAt } |
    ConvertTo-Json -Compress
  $payload = ConvertTo-Base64Url ($utf8.GetBytes($payloadJson))
  $unsigned = "$header.$payload"
  $hmac = [System.Security.Cryptography.HMACSHA256]::new()
  try {
    $hmac.Key = $utf8.GetBytes($Secret)
    $signature = ConvertTo-Base64Url ($hmac.ComputeHash($utf8.GetBytes($unsigned)))
  } finally {
    $hmac.Dispose()
  }
  return "$unsigned.$signature"
}

function Invoke-SaluniCompose {
  & docker compose --env-file $EnvironmentFile -f $ComposeFile @args
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose failed with exit code $LASTEXITCODE."
  }
}

function ConvertFrom-SecureValue([Security.SecureString]$Value) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is not installed. Install and start Docker Desktop first."
}
& docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop is not running."
}

if (-not (Test-Path -LiteralPath $EnvironmentFile)) {
  $postgresPassword = New-HexSecret
  $runtimePassword = New-HexSecret
  $jwtSecret = New-HexSecret
  $anonymousKey = New-AuthToken "anon" $jwtSecret
  $serviceRoleKey = New-AuthToken "service_role" $jwtSecret
  $lines = @(
    "SALUNI_VERSION=server",
    "SALUNI_HTTP_PORT=8080",
    "SALUNI_LOCAL_URL=http://localhost:8080",
    "LOCAL_POSTGRES_PASSWORD=$postgresPassword",
    "LOCAL_APP_RUNTIME_PASSWORD=$runtimePassword",
    "GOTRUE_JWT_SECRET=$jwtSecret",
    "SUPABASE_ANON_KEY=$anonymousKey",
    "SUPABASE_SERVICE_ROLE_KEY=$serviceRoleKey"
  )
  [IO.File]::WriteAllLines($EnvironmentFile, $lines, [Text.UTF8Encoding]::new($false))
  Write-Host "Generated local secrets in .env.server."
} else {
  Write-Host "Keeping the existing .env.server and database identity."
}

Write-Host "Building SALUNI and starting the local database and authentication service..."
Invoke-SaluniCompose build tooling core-api
Invoke-SaluniCompose up -d postgres gotrue

Write-Host "Applying database migrations and configuring the restricted runtime role..."
Invoke-SaluniCompose run --rm -T tooling npx prisma migrate deploy
Invoke-SaluniCompose run --rm -T tooling node scripts/local-stack/set-app-runtime-password.mjs

Write-Host "Starting SALUNI, nginx, and the public HTTPS tunnel..."
Invoke-SaluniCompose up -d core-api nginx cloudflared

$publicUrl = $null
for ($attempt = 0; $attempt -lt 60 -and -not $publicUrl; $attempt++) {
  $tunnelLogs = (& docker compose --env-file $EnvironmentFile -f $ComposeFile logs --no-color cloudflared 2>&1) |
    Out-String
  $urls = [regex]::Matches($tunnelLogs, 'https://[a-z0-9-]+\.trycloudflare\.com')
  if ($urls.Count -gt 0) {
    $publicUrl = $urls[$urls.Count - 1].Value
    break
  }
  Start-Sleep -Seconds 2
}
if (-not $publicUrl) {
  throw "The Cloudflare public URL was not found. Inspect: docker compose --env-file .env.server -f docker-compose.server.yml logs cloudflared"
}

if (-not $SkipInitialization) {
  $tenantName = Read-Host "Salon name [Caprice D'Ebene]"
  if ([string]::IsNullOrWhiteSpace($tenantName)) { $tenantName = "Caprice D'Ebene" }
  $ownerName = Read-Host "Owner full name"
  $ownerEmail = Read-Host "Owner email"
  $ownerPassword = ConvertFrom-SecureValue (Read-Host "Owner password (minimum 14 characters)" -AsSecureString)
  $ownerConfirmation = ConvertFrom-SecureValue (Read-Host "Confirm owner password" -AsSecureString)
  if ($ownerPassword -ne $ownerConfirmation) { throw "Owner passwords do not match." }
  if ($ownerPassword.Length -lt 14) { throw "Owner password must contain at least 14 characters." }

  try {
    $env:CLIENT_TENANT_NAME = $tenantName
    $env:CLIENT_OWNER_NAME = $ownerName
    $env:CLIENT_OWNER_EMAIL = $ownerEmail
    $env:CLIENT_OWNER_PASSWORD = $ownerPassword
    Invoke-SaluniCompose run --rm -T -e CLIENT_TENANT_NAME -e CLIENT_OWNER_NAME -e CLIENT_OWNER_EMAIL -e CLIENT_OWNER_PASSWORD tooling node scripts/initialize-client.mjs
    Invoke-SaluniCompose run --rm -T -e CLIENT_TENANT_NAME tooling node scripts/import-catalogue-caprice.mjs
    Invoke-SaluniCompose run --rm -T -e CLIENT_TENANT_NAME tooling node scripts/verify-client-installation.mjs
  } finally {
    Remove-Item Env:CLIENT_TENANT_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:CLIENT_OWNER_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:CLIENT_OWNER_EMAIL -ErrorAction SilentlyContinue
    Remove-Item Env:CLIENT_OWNER_PASSWORD -ErrorAction SilentlyContinue
    $ownerPassword = $null
    $ownerConfirmation = $null
  }
}

$ready = $false
for ($attempt = 0; $attempt -lt 60 -and -not $ready; $attempt++) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$publicUrl/login" -TimeoutSec 10
    $ready = $response.StatusCode -eq 200
  } catch {
    Start-Sleep -Seconds 2
  }
}
if (-not $ready) { throw "SALUNI did not become reachable through $publicUrl." }

Invoke-SaluniCompose ps
Write-Host ""
Write-Host "SALUNI is publicly available at: $publicUrl/login" -ForegroundColor Green
Write-Host "This test URL can change when the cloudflared container is recreated."
