# Builds a signed release APK locally (requires Android SDK + Java 17).
# Output: dist/Montra-release.apk

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Resolve-AndroidSdk {
    if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) {
        return $env:ANDROID_HOME
    }
    $defaultSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
    if (Test-Path $defaultSdk) {
        return $defaultSdk
    }
    throw "Android SDK not found. Install Android Studio or set ANDROID_HOME."
}

Write-Host "Checking Android SDK..."
$env:ANDROID_HOME = Resolve-AndroidSdk
Write-Host "Using ANDROID_HOME=$($env:ANDROID_HOME)"

if (-not (Test-Path "$ProjectRoot\android")) {
    Write-Host "Running Expo prebuild for Android..."
    npx expo prebuild --platform android --clean
}

Write-Host "Building release APK..."
Set-Location "$ProjectRoot\android"
.\gradlew.bat assembleRelease --no-daemon

$apkSource = Get-ChildItem -Path "$ProjectRoot\android\app\build\outputs\apk\release" -Filter "*.apk" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $apkSource) {
    throw "APK build finished but no release APK was found."
}

$distDir = Join-Path $ProjectRoot "dist"
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
$apkDest = Join-Path $distDir "Montra-release.apk"
Copy-Item $apkSource.FullName $apkDest -Force

Write-Host ""
Write-Host "APK ready: $apkDest"
