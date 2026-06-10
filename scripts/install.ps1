[CmdletBinding()]
param(
    [string]$Version = $(if ($env:ATHENA_CODE_VERSION) { $env:ATHENA_CODE_VERSION } else { "latest" }),
    [string]$Repository = $(if ($env:ATHENA_CODE_REPOSITORY) { $env:ATHENA_CODE_REPOSITORY } else { "luckeyfaraday/athena-code" }),
    [string]$InstallRoot = $(if ($env:ATHENA_CODE_INSTALL_ROOT) { $env:ATHENA_CODE_INSTALL_ROOT } else { Join-Path $env:LOCALAPPDATA "AthenaCode" }),
    [string]$BinDir = $(if ($env:ATHENA_CODE_BIN_DIR) { $env:ATHENA_CODE_BIN_DIR } else { Join-Path $env:LOCALAPPDATA "AthenaCode\bin" }),
    [string]$FromFile
)

$ErrorActionPreference = "Stop"

$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
switch ($architecture) {
    "x64" { $targetArchitecture = "x64" }
    "arm64" { $targetArchitecture = "arm64" }
    default { throw "Unsupported Windows architecture: $architecture" }
}

New-Item -ItemType Directory -Force -Path $InstallRoot, $BinDir | Out-Null
$target = Join-Path $InstallRoot "athena-code.exe"
$command = Join-Path $BinDir "athena-code.exe"

if ($FromFile) {
    if (-not (Test-Path -LiteralPath $FromFile -PathType Leaf)) {
        throw "Binary not found: $FromFile"
    }
    Copy-Item -LiteralPath $FromFile -Destination $target -Force
} else {
    $releasePath = if ($Version -eq "latest") { "latest/download" } else { "download/$Version" }
    $asset = "athena-code-windows-$targetArchitecture.zip"
    $baseUrl = "https://github.com/$Repository/releases/$releasePath"
    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("athena-code-" + [guid]::NewGuid())
    New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

    try {
        $archive = Join-Path $tempDir $asset
        $checksumFile = "$archive.sha256"
        Write-Host "Downloading Athena Code $Version..."
        Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/$asset" -OutFile $archive
        Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/$asset.sha256" -OutFile $checksumFile

        $expected = ((Get-Content -LiteralPath $checksumFile -Raw).Trim() -split "\s+")[0].ToLowerInvariant()
        $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $expected) {
            throw "Checksum mismatch for $asset"
        }

        Expand-Archive -LiteralPath $archive -DestinationPath $tempDir -Force
        Copy-Item -LiteralPath (Join-Path $tempDir "athena-code.exe") -Destination $target -Force
    } finally {
        Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Copy-Item -LiteralPath $target -Destination $command -Force

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$pathEntries = @($userPath -split ";" | Where-Object { $_ })
if ($pathEntries -notcontains $BinDir) {
    $newUserPath = (@($pathEntries) + $BinDir) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
}
if (($env:Path -split ";") -notcontains $BinDir) {
    $env:Path = "$BinDir;$env:Path"
}

Write-Host "Installed Athena Code:"
Write-Host "  binary: $target"
Write-Host "  command: $command"
Write-Host ""
Write-Host "Run: athena-code"
