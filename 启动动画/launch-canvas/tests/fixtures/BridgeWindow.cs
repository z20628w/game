using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;
class BridgeWindow:ApplicationContext {
    readonly string root=AppDomain.CurrentDomain.BaseDirectory;
    readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer {Interval=40};
    Form window,extra;
    void Show(){if(window==null||window.IsDisposed){window=new Form {Text="LaunchCanvas Bridge Fixture",Bounds=new Rectangle(90,90,850,540)};window.Controls.Add(new Label {Text="独立启动器与主窗口进程测试",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleCenter});}window.Show();window.Activate();}
    BridgeWindow(){Show();var helper=new ProcessStartInfo(Application.ExecutablePath,"--type=renderer"){UseShellExecute=false};Process.Start(helper);timer.Tick+=(s,e)=>{foreach(var action in new[]{"show","close","second","close-extra","quit"}){var file=Path.Combine(root,action);if(!File.Exists(file))continue;File.Delete(file);if(action=="show")Show();else if(action=="close")window.Close();else if(action=="second"){extra=new Form {Text="Calibration Secondary Fixture",Bounds=new Rectangle(160,160,700,440)};extra.Show();}else if(action=="close-extra"){if(extra!=null)extra.Close();}else{timer.Stop();window.Close();if(extra!=null)extra.Close();ExitThread();}}};timer.Start();}
    [STAThread] static void Main(string[] args){
        string root=AppDomain.CurrentDomain.BaseDirectory;
        if(Array.IndexOf(args,"--type=renderer")>=0){for(int i=0;i<1800&&!File.Exists(Path.Combine(root,"quit-helper"));i++)Thread.Sleep(100);return;}
        string key="LaunchCanvasBridge_"+root.GetHashCode();bool created;
        using(var mutex=new Mutex(true,key,out created)){if(!created){File.WriteAllText(Path.Combine(root,"show"),"show");return;}Application.EnableVisualStyles();Application.Run(new BridgeWindow());}
    }
}
