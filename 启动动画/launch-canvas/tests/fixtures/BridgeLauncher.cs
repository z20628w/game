using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
[assembly:AssemblyProduct("Bridge Fixture Launcher")]
[assembly:AssemblyTitle("Bridge Fixture Launcher")]
class BridgeLauncher {
    static int Main(){var root=AppDomain.CurrentDomain.BaseDirectory;var file=Path.Combine(root,"app","BridgeFixture.exe");Process.Start(new ProcessStartInfo(file){UseShellExecute=false,WorkingDirectory=Path.GetDirectoryName(file)});return 0;}
}
