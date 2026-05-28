# Prepare app-icon.png for `tauri icon`.
#
# Two-phase approach:
#   1. If the source already has transparent corners (artwork sits on a
#      transparent background with margin), crop tightly to the bounding
#      box of opaque pixels so the logo fills the icon canvas. Windows
#      scales the icon to fit the taskbar slot (24-32px) -- any built-in
#      margin in the source becomes wasted space in the taskbar, making
#      our icon look smaller than apps whose artwork goes edge-to-edge.
#   2. If the source has opaque corners (artwork covers the full canvas),
#      apply an anti-aliased circular alpha mask instead -- this was the
#      original problem the script solved.
#
# Either way the output is a centered, square, RGBA PNG ready for
# `tauri icon` to rasterise into every platform size.
#
# Usage:  powershell -ExecutionPolicy Bypass -File tools/fix-icon.ps1

param(
    [string] $Source = (Resolve-Path (Join-Path $PSScriptRoot '..\app-icon.png')).Path,
    [string] $Output = (Join-Path $PSScriptRoot '..\app-icon-circular.png'),
    [int]    $AlphaThreshold = 16,   # pixels with alpha <= this are "background"
    [int]    $Margin = 2,             # breathing room around the cropped bbox
    # Final emit size. tauri icon will downscale from this to 16/32/48/256
    # etc., and bicubic interpolation produces noticeably sharper small
    # sizes when fed a 1024 source instead of the raw cropped bbox.
    [int]    $TargetSize = 1024
)

Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Bitmap]::FromFile($Source)
try {
    $W = $src.Width
    $H = $src.Height

    # Read the entire pixel buffer once via LockBits. GetPixel works but
    # is ~100x slower for a 500x500 image -- the per-call GDI+ overhead
    # dominates over the actual byte fetch.
    $rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
    $data = $src.LockBits(
        $rect,
        [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $bytes = New-Object byte[] ($data.Stride * $H)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
    $src.UnlockBits($data)

    # Are there any transparent corner pixels? If yes the source already
    # uses an alpha channel and we should crop. Otherwise the artwork is
    # fully opaque and we fall back to the circular mask path.
    $idxTL = 0 * $data.Stride + 0 * 4 + 3
    $idxTR = 0 * $data.Stride + ($W - 1) * 4 + 3
    $idxBL = ($H - 1) * $data.Stride + 0 * 4 + 3
    $idxBR = ($H - 1) * $data.Stride + ($W - 1) * 4 + 3
    $hasAlpha = ($bytes[$idxTL] -le $AlphaThreshold) -or
                ($bytes[$idxTR] -le $AlphaThreshold) -or
                ($bytes[$idxBL] -le $AlphaThreshold) -or
                ($bytes[$idxBR] -le $AlphaThreshold)

    if ($hasAlpha) {
        # ----- Crop to content bbox -----
        $minX = $W; $minY = $H; $maxX = -1; $maxY = -1
        for ($y = 0; $y -lt $H; $y++) {
            $row = $y * $data.Stride
            for ($x = 0; $x -lt $W; $x++) {
                $a = $bytes[$row + $x * 4 + 3]
                if ($a -gt $AlphaThreshold) {
                    if ($x -lt $minX) { $minX = $x }
                    if ($x -gt $maxX) { $maxX = $x }
                    if ($y -lt $minY) { $minY = $y }
                    if ($y -gt $maxY) { $maxY = $y }
                }
            }
        }
        if ($maxX -lt 0) {
            throw "Source image appears fully transparent -- nothing to crop"
        }

        # Add a small margin so anti-aliased edges don't get clipped, then
        # clamp to image bounds.
        $minX = [Math]::Max(0, $minX - $Margin)
        $minY = [Math]::Max(0, $minY - $Margin)
        $maxX = [Math]::Min($W - 1, $maxX + $Margin)
        $maxY = [Math]::Min($H - 1, $maxY + $Margin)
        $bw = $maxX - $minX + 1
        $bh = $maxY - $minY + 1

        # Pad to square -- `tauri icon` expects square input. Centre the
        # content so non-square logos don't end up off-axis.
        $size = [Math]::Max($bw, $bh)
        $dst = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($dst)
        try {
            $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $g.Clear([System.Drawing.Color]::Transparent)

            $offsetX = [int](($size - $bw) / 2)
            $offsetY = [int](($size - $bh) / 2)
            $srcRect = New-Object System.Drawing.Rectangle $minX, $minY, $bw, $bh
            $dstRect = New-Object System.Drawing.Rectangle $offsetX, $offsetY, $bw, $bh
            $g.DrawImage($src, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
        } finally {
            $g.Dispose()
        }
        # ----- Final emit: upscale the centred logo to $TargetSize so
        #       tauri icon has a high-quality source to downsample from.
        #       No backdrop / fill — the canvas around the artwork stays
        #       transparent; the artwork itself fills its longest axis
        #       edge-to-edge.
        $final = New-Object System.Drawing.Bitmap $TargetSize, $TargetSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $gf = [System.Drawing.Graphics]::FromImage($final)
        try {
            $gf.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $gf.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $gf.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $gf.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $gf.Clear([System.Drawing.Color]::Transparent)
            $gf.DrawImage($dst, 0, 0, $TargetSize, $TargetSize)
        } finally {
            $gf.Dispose()
        }
        $final.Save($Output, [System.Drawing.Imaging.ImageFormat]::Png)
        $final.Dispose()
        $dst.Dispose()
        Write-Output ("Cropped + upscaled: source {0}x{1} -> logo {2}x{2} -> output {3}x{3}" -f $W, $H, $size, $TargetSize)
    } else {
        # ----- Fall back: source has solid corners, apply circular mask -----
        $size = [Math]::Max($W, $H)
        $dst = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($dst)
        try {
            $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $g.Clear([System.Drawing.Color]::Transparent)

            $inset = 14
            $path = New-Object System.Drawing.Drawing2D.GraphicsPath
            $path.AddEllipse([float]$inset, [float]$inset, [float]($size - 2 * $inset), [float]($size - 2 * $inset))
            $g.SetClip($path)

            $offsetX = ($size - $W) / 2
            $offsetY = ($size - $H) / 2
            $g.DrawImage($src, $offsetX, $offsetY, $W, $H)
            $path.Dispose()
        } finally {
            $g.Dispose()
        }
        $dst.Save($Output, [System.Drawing.Imaging.ImageFormat]::Png)
        $dst.Dispose()
        Write-Output ("Applied circular mask: {0}x{0}" -f $size)
    }
} finally {
    $src.Dispose()
}
