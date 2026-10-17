param([string]$Source = 'browser-tests/_current/gla-source')
$ErrorActionPreference = 'Stop'
# System.Drawing is used offline only. Retain alpha and atlas layout.
Add-Type -AssemblyName System.Drawing
$destination = Join-Path $Source 'optimized'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
Get-ChildItem -LiteralPath (Join-Path $Source 'textures') -File | ForEach-Object {
    $inputImage = [System.Drawing.Image]::FromFile($_.FullName)
    $ratio = [Math]::Min(1.0, 1024 / [Math]::Max($inputImage.Width, $inputImage.Height))
    $bitmap = New-Object System.Drawing.Bitmap([int]($inputImage.Width * $ratio), [int]($inputImage.Height * $ratio))
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($inputImage, 0, 0, $bitmap.Width, $bitmap.Height)
    $bitmap.Save((Join-Path (Resolve-Path $destination) ($_.BaseName + '.png')), [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose(); $bitmap.Dispose(); $inputImage.Dispose()
}
