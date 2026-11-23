using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

class WindowActivator {
    delegate bool EnumProc(IntPtr window,IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback,IntPtr data);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window,StringBuilder name,int length);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window,StringBuilder name,int length);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr window,int index);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window,int command);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr window,uint command);
    [DllImport("user32.dll")] static extern bool GetWindowPlacement(IntPtr window,ref Placement placement);
    [DllImport("user32.dll")] static extern bool GetLayeredWindowAttributes(IntPtr window,out uint color,out byte alpha,out uint flags);
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X,Y; }
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left,Top,Right,Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct Placement {public int Length,Flags,ShowCommand;public Point Min,Max;public Rect Normal;}
    static int Main(string[] args) {
        if(args.Length<3)return 2;
        int expectedPid;if(!int.TryParse(args[1],out expectedPid))return 2;
        try {using(var process=Process.GetProcessById(expectedPid))if(!String.Equals(process.MainModule.FileName,args[2],StringComparison.OrdinalIgnoreCase))return 3;}catch{return 3;}
        IntPtr chosen=IntPtr.Zero;long area=0;
        EnumWindows((window,data)=>{
            uint pid;GetWindowThreadProcessId(window,out pid);if(pid!=expectedPid)return true;
            var name=new StringBuilder(128);GetClassName(window,name,128);
            if(name.ToString()!="Chrome_WidgetWin_1"||(GetWindowLong(window,-20)&0x80)!=0||GetWindow(window,4)!=IntPtr.Zero)return true;
            var placement=new Placement();placement.Length=Marshal.SizeOf(placement);if(!GetWindowPlacement(window,ref placement))return true;
            int width=placement.Normal.Right-placement.Normal.Left,height=placement.Normal.Bottom-placement.Normal.Top;
            var title=new StringBuilder(256);GetWindowText(window,title,256);
            if(args[0]=="list") Console.WriteLine("window="+window+" visible="+IsWindowVisible(window)+" minimized="+IsIconic(window)+" size="+width+"x"+height+" title="+title);
            // Chromium 会保留无标题的隐藏宿主窗口；其面积可能比主窗口更大。
            if(String.IsNullOrWhiteSpace(title.ToString()))return true;
            // 使用还原矩形，最小化窗口也必须识别为已经打开。
            long candidate=(long)width*height;if(title.ToString()=="ChatGPT"||title.ToString()=="Codex")candidate+=(1L<<45);
            if(width>=650&&height>=400&&candidate>area){chosen=window;area=candidate;}
            return true;
        },IntPtr.Zero);
        bool found=chosen!=IntPtr.Zero,visible=found&&IsWindowVisible(chosen),minimized=found&&IsIconic(chosen);
        if(found&&args[0]=="show") {if(minimized)ShowWindow(chosen,9);BringWindowToTop(chosen);SetForegroundWindow(chosen);}
        uint color,flags;byte alpha;
        int opacity=found&&GetLayeredWindowAttributes(chosen,out color,out alpha,out flags)&&(flags&2)!=0?alpha:255;
        Console.WriteLine("{\"found\":"+found.ToString().ToLowerInvariant()+",\"visible\":"+visible.ToString().ToLowerInvariant()+",\"minimized\":"+minimized.ToString().ToLowerInvariant()+",\"alpha\":"+opacity+"}");
        return 0;
    }
}
