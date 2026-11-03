# Pulse media bridge. Reads "now playing" from Windows' System Media Transport Controls
# (works for Spotify, browsers, and any app that shows in the volume flyout).
# Writes one JSON line per change to stdout. Reads commands from stdin:
#   toggle | next | prev | seek <seconds>
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Wait-Op($op, [Type]$resultType) {
  $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($op))
  if ($task.Wait(4000)) { return $task.Result } else { return $null }
}

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$MgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$PropsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$manager = Wait-Op ($MgrType::RequestAsync()) $MgrType
if (-not $manager) { [Console]::Out.WriteLine('{"error":"media controls unavailable"}'); exit 1 }

$readStream = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]

function Get-Art($props) {
  try {
    if (-not $props.Thumbnail) { return '' }
    $ras = Wait-Op ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    if (-not $ras) { return '' }
    $stream = $readStream.Invoke($null, @($ras))
    $ms = New-Object System.IO.MemoryStream
    $stream.CopyTo($ms)
    $bytes = $ms.ToArray(); $stream.Dispose(); $ms.Dispose()
    if ($bytes.Length -gt 400000) { return '' }
    return 'data:image/png;base64,' + [Convert]::ToBase64String($bytes)
  } catch { return '' }
}

function Get-Session {
  $all = @($manager.GetSessions())
  $playing = $all | Where-Object { [int]$_.GetPlaybackInfo().PlaybackStatus -eq 4 } | Select-Object -First 1
  if ($playing) { return $playing }
  $current = $manager.GetCurrentSession()
  if ($current) { return $current }
  return $all | Select-Object -First 1
}

$stdin = [Console]::In
$pendingLine = $stdin.ReadLineAsync()
$lastKey = ''
$lastArtKey = ''
$art = ''

while ($true) {
  if ($pendingLine.IsCompleted) {
    $line = $pendingLine.Result
    if ($null -eq $line) { exit 0 }  # Pulse closed our stdin
    $s = Get-Session
    if ($s) {
      $parts = $line.Trim().Split(' ')
      switch ($parts[0]) {
        'toggle' { $null = $s.TryTogglePlayPauseAsync() }
        'next'   { $null = $s.TrySkipNextAsync() }
        'prev'   { $null = $s.TrySkipPreviousAsync() }
        'seek'   { $null = $s.TryChangePlaybackPositionAsync([long]([double]$parts[1] * 10000000)) }
      }
    }
    $pendingLine = $stdin.ReadLineAsync()
    $lastKey = ''  # report fresh state right after a command
  }

  $s = Get-Session
  if (-not $s) {
    if ($lastKey -ne 'none') { [Console]::Out.WriteLine('{"active":false}'); [Console]::Out.Flush(); $lastKey = 'none' }
  } else {
    $props = Wait-Op ($s.TryGetMediaPropertiesAsync()) $PropsType
    $info = $s.GetPlaybackInfo()
    $tl = $s.GetTimelineProperties()
    $title = if ($props) { $props.Title } else { '' }
    $artist = if ($props) { $props.Artist } else { '' }
    $playing = ([int]$info.PlaybackStatus -eq 4)
    $artKey = "$title|$artist"
    if ($artKey -ne $lastArtKey -and $props) { $art = Get-Art $props; $lastArtKey = $artKey }
    $pos = [math]::Round($tl.Position.TotalSeconds)
    $dur = [math]::Round($tl.EndTime.TotalSeconds)
    # The player bumps LastUpdatedTime on seeks and track changes; the island extrapolates in between.
    $key = "$artKey|$playing|$($tl.LastUpdatedTime.Ticks)"
    if ($key -ne $lastKey) {
      $obj = [ordered]@{
        active = $true; app = $s.SourceAppUserModelId; title = $title; artist = $artist
        playing = $playing; position = $pos; duration = $dur; art = $art
        updatedAt = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
      }
      [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
      [Console]::Out.Flush()
      $lastKey = $key
    }
  }
  Start-Sleep -Milliseconds 700
}
