// Pulse media helper (Windows). Replaces media.ps1 with the same line protocol at a fraction of the memory.
// Reads "now playing" from the System Media Transport Controls and the system output volume (Core Audio).
// stdout: one JSON line per change, {"type":"media",...} or {"type":"volume",...}
// stdin:  toggle | next | prev | seek <seconds> | vol <0-100> | mute <0|1>   (exits when stdin closes)
// Built by scripts/build-helper.js with the C# compiler that ships with Windows (.NET Framework 4.8).
using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Windows.Media.Control;
using Windows.Storage.Streams;

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

  static class Volume {
    static IAudioEndpointVolume Endpoint() {
      var en = (IMMDeviceEnumerator)new MMDeviceEnumerator(); IMMDevice dev;
      Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(0, 1, out dev));
      var iid = typeof(IAudioEndpointVolume).GUID; object o;
      Marshal.ThrowExceptionForHR(dev.Activate(ref iid, 23, IntPtr.Zero, out o));
      return (IAudioEndpointVolume)o;
    }
    public static void Read(out int level, out bool muted) {
      var ep = Endpoint(); float v; ep.GetMasterVolumeLevelScalar(out v); ep.GetMute(out muted);
      level = (int)Math.Round(v * 100);
    }
    public static void Set(int p) { Endpoint().SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, p)) / 100f, IntPtr.Zero); }
    public static void Mute(bool m) { Endpoint().SetMute(m, IntPtr.Zero); }
  }
}

static class Program {
  static GlobalSystemMediaTransportControlsSessionManager manager;
  static readonly object outLock = new object();
  static TextWriter stdout;

  static void Emit(string json) { lock (outLock) { stdout.Write(json); stdout.Write('\n'); stdout.Flush(); } }

  static string Str(string s) {
    if (s == null) return "\"\"";
    var b = new StringBuilder(s.Length + 2); b.Append('"');
    foreach (var c in s) {
      switch (c) {
        case '"': b.Append("\\\""); break;
        case '\\': b.Append("\\\\"); break;
        case '\n': b.Append("\\n"); break;
        case '\r': b.Append("\\r"); break;
        case '\t': b.Append("\\t"); break;
        default: if (c < 0x20) b.Append("\\u").Append(((int)c).ToString("x4")); else b.Append(c); break;
      }
    }
    return b.Append('"').ToString();
  }

  static T Wait<T>(Windows.Foundation.IAsyncOperation<T> op) where T : class {
    try { var t = op.AsTask(); return t.Wait(4000) ? t.Result : null; } catch { return null; }
  }

  static GlobalSystemMediaTransportControlsSession Session() {
    try {
      var all = manager.GetSessions();
      foreach (var s in all) {
        try { if (s.GetPlaybackInfo().PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing) return s; } catch {}
      }
      var current = manager.GetCurrentSession();
      if (current != null) return current;
      return all.FirstOrDefault();
    } catch { return null; }
  }

  static string Art(GlobalSystemMediaTransportControlsSessionMediaProperties props) {
    try {
      if (props.Thumbnail == null) return "";
      var ras = Wait(props.Thumbnail.OpenReadAsync());
      if (ras == null) return "";
      using (var stream = ras.AsStreamForRead())
      using (var ms = new MemoryStream()) {
        stream.CopyTo(ms);
        if (ms.Length > 400000) return "";
        return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
      }
    } catch { return ""; }
  }

  static volatile bool fresh;  // a command just ran: report state even if nothing seems to have changed

  static void Command(string line) {
    var parts = line.Trim().Split(' ');
    var arg = parts.Length > 1 ? parts[1] : "";
    try {
      if (parts[0] == "vol") { int v; if (int.TryParse(arg, out v)) PulseAudio.Volume.Set(v); }
      else if (parts[0] == "mute") PulseAudio.Volume.Mute(arg == "1");
      else {
        var s = Session();
        if (s == null) return;
        if (parts[0] == "toggle") s.TryTogglePlayPauseAsync();
        else if (parts[0] == "next") s.TrySkipNextAsync();
        else if (parts[0] == "prev") s.TrySkipPreviousAsync();
        else if (parts[0] == "seek") {
          double sec; if (double.TryParse(arg, NumberStyles.Float, CultureInfo.InvariantCulture, out sec)) s.TryChangePlaybackPositionAsync((long)(sec * 10000000));
        }
      }
    } catch {}
    fresh = true;
  }

  static int Main() {
    stdout = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
    manager = Wait(GlobalSystemMediaTransportControlsSessionManager.RequestAsync());
    if (manager == null) { Emit("{\"type\":\"media\",\"active\":false,\"error\":\"media controls unavailable\"}"); return 1; }

    var input = new Thread(() => {
      var reader = new StreamReader(Console.OpenStandardInput(), Encoding.UTF8);
      string line;
      while ((line = reader.ReadLine()) != null) Command(line);
      Environment.Exit(0);  // Pulse closed our stdin
    });
    input.IsBackground = true; input.Start();

    string lastVol = "", lastKey = "", lastArtKey = "", art = "";
    while (true) {
      try {
        int v; bool m; PulseAudio.Volume.Read(out v, out m);
        var vk = v + "|" + m;
        if (vk != lastVol) { Emit("{\"type\":\"volume\",\"level\":" + v + ",\"muted\":" + (m ? "true" : "false") + "}"); lastVol = vk; }
      } catch {}

      if (fresh) { fresh = false; lastKey = ""; lastVol = ""; }
      var s = Session();
      if (s == null) {
        if (lastKey != "none") { Emit("{\"type\":\"media\",\"active\":false}"); lastKey = "none"; }
      } else {
        try {
          var props = Wait(s.TryGetMediaPropertiesAsync());
          var info = s.GetPlaybackInfo();
          var tl = s.GetTimelineProperties();
          var title = props != null ? props.Title : "";
          var artist = props != null ? props.Artist : "";
          var playing = info.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
          var artKey = title + "|" + artist;
          if (artKey != lastArtKey && props != null) { art = Art(props); lastArtKey = artKey; }
          // The player bumps LastUpdatedTime on seeks and track changes; the island extrapolates in between.
          var key = artKey + "|" + playing + "|" + tl.LastUpdatedTime.Ticks;
          if (key != lastKey) {
            Emit("{\"type\":\"media\",\"active\":true,\"app\":" + Str(s.SourceAppUserModelId) +
              ",\"title\":" + Str(title) + ",\"artist\":" + Str(artist) +
              ",\"playing\":" + (playing ? "true" : "false") +
              ",\"position\":" + Math.Round(tl.Position.TotalSeconds).ToString(CultureInfo.InvariantCulture) +
              ",\"duration\":" + Math.Round(tl.EndTime.TotalSeconds).ToString(CultureInfo.InvariantCulture) +
              ",\"art\":" + Str(art) +
              ",\"updatedAt\":" + tl.LastUpdatedTime.ToUnixTimeMilliseconds() + "}");
            lastKey = key;
          }
        } catch {}
      }
      Thread.Sleep(700);
    }
  }
}
