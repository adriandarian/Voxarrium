param([string]$ArchivePath = (Join-Path $HOME 'Downloads/Voxarrium-reference-images.zip'))
$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$ManifestPath = Join-Path $Root 'docs/reference/manifest.json'
$Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if (!(Test-Path -LiteralPath $ArchivePath -PathType Leaf)) { throw "Reference ZIP not found: $ArchivePath" }
if ($Manifest.schemaVersion -ne 1 -or $Manifest.images.Count -ne 4) { throw 'Unexpected reference manifest' }
$Expected = @{}
foreach ($Image in $Manifest.images) {
  if ($Image.path -cnotmatch '^(experiments/)?[a-z0-9-]+\.png$' -or $Image.sha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'Invalid manifest path/hash' }
  $Name = 'docs/reference/' + $Image.path
  if ($Expected.ContainsKey($Name)) { throw 'Duplicate manifest path' }
  $Expected[$Name] = $Image
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Temporary = Join-Path ([IO.Path]::GetTempPath()) ('voxarrium-refs-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Temporary | Out-Null
$Archive = $null
try {
  $Archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ArchivePath).Path)
  if ($Archive.Entries.Count -ne $Expected.Count) { throw 'ZIP must contain exactly the four original PNGs' }
  $Seen = @{}
  $Pending = @()
  $Index = 0
  foreach ($Entry in $Archive.Entries) {
    $Name = $Entry.FullName
    if (!$Expected.ContainsKey($Name) -or $Seen.ContainsKey($Name)) { throw "Unexpected or duplicate ZIP entry: $Name" }
    $Seen[$Name] = $true
    $Image = $Expected[$Name]
    if ($Entry.Length -ne $Image.bytes -or $Entry.Length -gt 20000000) { throw "Unexpected size: $Name" }
    $Staged = Join-Path $Temporary ("$Index.png")
    $Index++
    [IO.Compression.ZipFileExtensions]::ExtractToFile($Entry, $Staged, $false)
    if ((Get-FileHash -LiteralPath $Staged -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Image.sha256) { throw "SHA-256 mismatch: $Name" }
    $Bytes = [IO.File]::ReadAllBytes($Staged)
    if ($Bytes.Length -lt 24 -or [BitConverter]::ToString($Bytes[0..7]) -ne '89-50-4E-47-0D-0A-1A-0A') { throw "Invalid PNG: $Name" }
    $WidthBytes = [byte[]]$Bytes[16..19]; [array]::Reverse($WidthBytes)
    $HeightBytes = [byte[]]$Bytes[20..23]; [array]::Reverse($HeightBytes)
    if ([BitConverter]::ToUInt32($WidthBytes, 0) -ne $Image.width -or [BitConverter]::ToUInt32($HeightBytes, 0) -ne $Image.height) { throw "Dimension mismatch: $Name" }
    $Destination = Join-Path $Root $Name
    if ((Test-Path -LiteralPath $Destination) -and (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Image.sha256) { throw "Refusing to overwrite a different file: $Destination" }
    $Pending += [pscustomobject]@{ Source = $Staged; Destination = $Destination }
  }
  # All entries are validated before any repository image is written.
  foreach ($Item in $Pending) {
    New-Item -ItemType Directory -Path (Split-Path $Item.Destination -Parent) -Force | Out-Null
    if (!(Test-Path -LiteralPath $Item.Destination)) { Copy-Item -LiteralPath $Item.Source -Destination $Item.Destination }
  }
  Write-Host 'Imported four original reference PNGs with verified hashes and dimensions.'
  & node (Join-Path $PSScriptRoot 'references.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Final Node reference verification failed; inspect output.' }
} finally {
  if ($Archive) { $Archive.Dispose() }
  Remove-Item -LiteralPath $Temporary -Recurse -Force
}
