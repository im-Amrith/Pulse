# Pulse media bridge. Reads "now playing" from Windows' System Media Transport Controls
# (works for Spotify, browsers, and any app that shows in the volume flyout).
# Also reports and sets the system output volume (Core Audio).
# Writes one JSON line per change to stdout ({type:'media',...} or {type:'volume',...}).
# Reads commands from stdin: toggle | next | prev | seek <seconds> | vol <0-100> | mute <0|1>
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
namespace PulseAudio {
  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr n); int UnregisterControlChangeNotify(IntPtr n);
    int GetChannelCount(out uint c);
    int SetMasterVolumeLevel(float db, IntPtr ctx); int SetMasterVolumeLevelScalar(float v, IntPtr ctx);
    int GetMasterVolumeLevel(out float db); int GetMasterVolumeLevelScalar(out float v);
    int SetChannelVolumeLevel(uint ch, float db, IntPtr ctx); int SetChannelVolumeLevelScalar(uint ch, float v, IntPtr ctx);
    int GetChannelVolumeLevel(uint ch, out float db); int GetChannelVolumeLevelScalar(uint ch, out float v);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, IntPtr ctx); int GetMute([MarshalAs(UnmanagedType.Bool)] out bool m);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice { int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator { int EnumAudioEndpoints(int flow, int mask, out IntPtr devs); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice d); }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
  public static class Volume {
    static IAudioEndpointVolume Endpoint() {
      var en = (IMMDeviceEnumerator)new MMDeviceEnumerator(); IMMDevice dev;
      Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(0, 1, out dev));
      var iid = typeof(IAudioEndpointVolume).GUID; object o;
      Marshal.ThrowExceptionForHR(dev.Activate(ref iid, 23, IntPtr.Zero, out o));
      return (IAudioEndpointVolume)o;
    }
    public static int Get() { float v; Endpoint().GetMasterVolumeLevelScalar(out v); return (int)Math.Round(v * 100); }
    public static void Set(int p) { Endpoint().SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, p)) / 100f, IntPtr.Zero); }
    public static bool Muted() { bool m; Endpoint().GetMute(out m); return m; }
    public static void Mute(bool m) { Endpoint().SetMute(m, IntPtr.Zero); }
  }
}
'@
$lastVol = ''

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
if (-not $manager) { [Console]::Out.WriteLine('{"type":"media","active":false,"error":"media controls unavailable"}'); exit 1 }

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

# [Console]::In is a synchronized reader whose ReadLineAsync actually blocks; a raw StreamReader is truly async.
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
$pendingLine = $stdin.ReadLineAsync()
$lastKey = ''
$lastArtKey = ''
$art = ''

while ($true) {
  if ($pendingLine.IsCompleted) {
    $line = $pendingLine.Result
    if ($null -eq $line) { exit 0 }  # Pulse closed our stdin
    $parts = $line.Trim().Split(' ')
    if ($parts[0] -eq 'vol') { try { [PulseAudio.Volume]::Set([int]$parts[1]) } catch {} ; $lastVol = '' }
    if ($parts[0] -eq 'mute') { try { [PulseAudio.Volume]::Mute($parts[1] -eq '1') } catch {} ; $lastVol = '' }
    $s = Get-Session
    if ($s) {
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

  try {
    $v = [PulseAudio.Volume]::Get(); $m = [PulseAudio.Volume]::Muted()
    if ("$v|$m" -ne $lastVol) {
      [Console]::Out.WriteLine((@{ type = 'volume'; level = $v; muted = $m } | ConvertTo-Json -Compress)); [Console]::Out.Flush()
      $lastVol = "$v|$m"
    }
  } catch {}

  $s = Get-Session
  if (-not $s) {
    if ($lastKey -ne 'none') { [Console]::Out.WriteLine('{"type":"media","active":false}'); [Console]::Out.Flush(); $lastKey = 'none' }
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
        type = 'media'; active = $true; app = $s.SourceAppUserModelId; title = $title; artist = $artist
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
