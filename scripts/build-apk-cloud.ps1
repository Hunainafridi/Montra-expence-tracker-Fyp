# Cloud APK build via EAS (Option B)
# Run in Cursor terminal: npm run build:apk:cloud

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "Checking Expo login..."
npx eas-cli@latest whoami 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Log in to Expo in your browser, then re-run: npm run build:apk:cloud"
    npx eas-cli@latest login
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host ""
Write-Host "Linking project to EAS (first time only)..."
npx eas-cli@latest init --non-interactive 2>&1 | Out-Host

$envFileArg = @()
if (Test-Path ".env") {
    $envFileArg = @("--env-file", ".env")
    Write-Host "Using .env for build variables."
} else {
    Write-Host "Warning: no .env file. Firebase/API keys may be missing in the build."
}

Write-Host ""
Write-Host "Starting cloud APK build (preview profile)..."
npx eas-cli@latest build --platform android --profile preview --non-interactive @envFileArg

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Build submitted. Download the APK from the Expo dashboard link above."
}
