param([string]$HarnessDirectory = (Join-Path $env:LOCALAPPDATA 'Programs/DeepSeek Harness'), [switch]$PackageOnly)
$ErrorActionPreference = 'Stop'
$cli = Join-Path $HarnessDirectory 'resources/runtime/cli/bin/dsh.cmd'
$pnpm = Join-Path $HarnessDirectory 'resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.cjs'
if (-not (Test-Path -LiteralPath $cli) -or -not (Test-Path -LiteralPath $pnpm)) { throw 'Harness bundled CLI/pnpm not found; specify -HarnessDirectory.' }
Push-Location $PSScriptRoot
try {
    & node --test plugin/test/*.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Plugin tests failed; installation cancelled.' }
    $dist = Join-Path $PSScriptRoot 'build/plugin'
    New-Item -ItemType Directory -Path $dist -Force | Out-Null
    & node $pnpm --dir (Join-Path $PSScriptRoot 'plugin') pack --pack-destination $dist
    if ($LASTEXITCODE -ne 0) { throw 'Plugin packaging failed.' }
    $packageVersion = (Get-Content -LiteralPath 'plugin/package.json' -Raw | ConvertFrom-Json).version
    $packageFile = Join-Path $dist "loveandrobot-dsh-pet-usb-$packageVersion.tgz"
    if (-not (Test-Path -LiteralPath $packageFile)) { throw 'Packaged plugin not found.' }
    Get-FileHash -LiteralPath $packageFile -Algorithm SHA256 | Format-List
    if ($PackageOnly) { return }
    $harnessHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
    $profile = Join-Path $harnessHome 'profiles/desktop'
    if (-not (Test-Path -LiteralPath (Join-Path $profile 'package.json'))) { throw 'Open Harness Desktop once before installing.' }
    $backup = Join-Path $PSScriptRoot ('.tools/backups/harness-profile-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $backup | Out-Null
    foreach ($file in @('package.json','cordis.patch.yml','cordis.yml','pnpm-workspace.yaml','pnpm-lock.yaml')) {
        $source = Join-Path $profile $file
        if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $backup $file) }
    }
    & $cli plugin --profile desktop add $packageFile
    if ($LASTEXITCODE -ne 0) { throw "Harness plugin installation failed. Previous profile backup: $backup" }
    # A local tarball with the same version/path may be reused from pnpm cache.
    # Never report success unless the installed runtime is the reviewed source.
    $sourceRoot = Join-Path $PSScriptRoot 'plugin'
    $installedRoot = Join-Path $profile 'node_modules/@loveandrobot/dsh-pet-usb'
    # pnpm may reorder manifest keys; compare parsed values rather than formatting.
    & node --input-type=module -e 'import fs from "node:fs"; import assert from "node:assert/strict"; assert.deepEqual(JSON.parse(fs.readFileSync(process.argv[1],"utf8")),JSON.parse(fs.readFileSync(process.argv[2],"utf8")));' (Join-Path $sourceRoot 'package.json') (Join-Path $installedRoot 'package.json')
    if ($LASTEXITCODE -ne 0) { throw "Installed manifest differs from source; bump the package version and reinstall. Backup: $backup" }
    $verifyFiles = @('cordis.patch.yml','README.md')
    foreach ($directory in @('src','client','bridge')) {
        $verifyFiles += Get-ChildItem -LiteralPath (Join-Path $sourceRoot $directory) -File -Recurse | ForEach-Object { [IO.Path]::GetRelativePath($sourceRoot,$_.FullName) }
    }
    foreach ($relative in $verifyFiles) {
        $installedFile = Join-Path $installedRoot $relative
        if (-not (Test-Path -LiteralPath $installedFile) -or (Get-FileHash -LiteralPath (Join-Path $sourceRoot $relative)).Hash -ne (Get-FileHash -LiteralPath $installedFile).Hash) {
            throw "Installed plugin does not match source ($relative). Bump the plugin version and reinstall; do not trust a cached same-version package. Backup: $backup"
        }
    }
    Write-Output 'Installed runtime files match the reviewed source.'
    Write-Output "Plugin installed. Profile backup: $backup"
} finally { Pop-Location }
