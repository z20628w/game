using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

class WindowHost : ApplicationContext {
    delegate bool Enumerate(IntPtr window,IntPtr data);
    delegate void EventProc(IntPtr hook,uint ev,IntPtr window,int obj,int child,uint thread,uint time);
    [DllImport("user32.dll")] static extern bool EnumWindows(Enumerate callback,IntPtr data);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr window,uint command);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr window,int index);
    [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr window,int index,int value);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window,int mode);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr window,uint color,byte alpha,uint flags);
    [DllImport("user32.dll")] static extern bool GetLayeredWindowAttributes(IntPtr window,out uint color,out byte alpha,out uint flags);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window,StringBuilder text,int length);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window,StringBuilder text,int length);
    [DllImport("kernel32.dll")] static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool Process32FirstW(IntPtr snapshot,ref ProcessEntry entry);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool Process32NextW(IntPtr snapshot,ref ProcessEntry entry);
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct ProcessEntry { public uint Size,Usage,Pid; public IntPtr Heap; public uint Module,Threads,Parent; public int Priority; public uint Flags; [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string Exe; }
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out Rect bounds);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window,out Rect bounds);
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window,ref Point point);
    [DllImport("user32.dll")] static extern bool GetWindowPlacement(IntPtr window,ref Placement placement);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min,uint max,IntPtr module,EventProc callback,uint process,uint thread,uint flags);
    [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr process,int kind,IntPtr buffer,int length,out int needed);
    [DllImport("shell32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CommandLineToArgvW(string command,out int count);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
    [StructLayout(LayoutKind.Sequential)] struct UnicodeString { public ushort Length,MaximumLength; public IntPtr Buffer; }
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X,Y; }
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left,Top,Right,Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct Placement { public int Length,Flags,Show; public Point Min,Max; public Rect Normal; }
    class Saved { public int Pid,Style; public byte Alpha; public uint Color,Flags; public bool Layered; }
    readonly string executable, signal, title;
    readonly Dictionary<IntPtr,Saved> saved=new Dictionary<IntPtr,Saved>();
    readonly Timer timer=new Timer {Interval=16};
    readonly Stopwatch clock=Stopwatch.StartNew();
    readonly EventProc callback;
    IntPtr hook;
    bool done;
    static readonly HashSet<int> owners=new HashSet<int>();
    static readonly HashSet<int> mainOwners=new HashSet<int>();
    static readonly List<int> unknownOwners=new List<int>();
    static bool electron;
    static string classFilter="";
    static object ListWindows(){
        var parents=new Dictionary<int,int>();var snapshot=CreateToolhelp32Snapshot(2,0);
        if(snapshot!=new IntPtr(-1)){try{var entry=new ProcessEntry();entry.Size=(uint)Marshal.SizeOf(entry);if(Process32FirstW(snapshot,ref entry))do{parents[(int)entry.Pid]=(int)entry.Parent;}while(Process32NextW(snapshot,ref entry));}finally{CloseHandle(snapshot);}}
        var result=new List<object>();int session=Process.GetCurrentProcess().SessionId;
        EnumWindows((window,data)=>{
            if(!IsWindowVisible(window)||(GetWindowLong(window,-20)&0x80)!=0||GetWindow(window,4)!=IntPtr.Zero)return true;
            var title=new StringBuilder(512);GetWindowText(window,title,512);if(String.IsNullOrWhiteSpace(title.ToString()))return true;
            Rect rect;GetWindowRect(window,out rect);bool minimized=IsIconic(window);
            if(minimized){var placement=new Placement();placement.Length=Marshal.SizeOf(placement);if(GetWindowPlacement(window,ref placement))rect=placement.Normal;}
            if(rect.Right-rect.Left<320||rect.Bottom-rect.Top<200)return true;
            uint pid;GetWindowThreadProcessId(window,out pid);
            try{using(var process=Process.GetProcessById((int)pid)){
                if(process.SessionId!=session||IsMainProcess((int)pid)==false)return true;
                string exe=process.MainModule.FileName;var type=new StringBuilder(256);GetClassName(window,type,256);
                var ancestors=new List<int>();int current=(int)pid,parent;while(ancestors.Count<24&&parents.TryGetValue(current,out parent)&&parent>0&&!ancestors.Contains(parent)){ancestors.Add(parent);current=parent;}
                result.Add(new{handle=window.ToInt64().ToString(),pid=pid,executable=exe,title=title.ToString(),windowClass=type.ToString(),ancestors=ancestors,width=rect.Right-rect.Left,height=rect.Bottom-rect.Top,minimized=minimized});
            }}catch{/* 无法读取归属的高权限窗口不提供绑定。 */}return true;
        },IntPtr.Zero);
        return result;
    }
    static bool? IsMainProcess(int pid){
        IntPtr process=OpenProcess(0x1000,false,pid),buffer=IntPtr.Zero,arguments=IntPtr.Zero;
        if(process==IntPtr.Zero)return null;
        try{
            int size;NtQueryInformationProcess(process,60,IntPtr.Zero,0,out size);
            if(size<Marshal.SizeOf(typeof(UnicodeString))||size>1024*1024)return null;
            buffer=Marshal.AllocHGlobal(size);
            if(NtQueryInformationProcess(process,60,buffer,size,out size)!=0)return null;
            var value=(UnicodeString)Marshal.PtrToStructure(buffer,typeof(UnicodeString));
            long offset=value.Buffer.ToInt64()-buffer.ToInt64();
            if(value.Length==0||offset<0||offset+value.Length>size)return null;
            string command=Marshal.PtrToStringUni(value.Buffer,value.Length/2);int count;
            arguments=CommandLineToArgvW(command,out count);if(arguments==IntPtr.Zero)return null;
            for(int i=1;i<count;i++){
                string arg=Marshal.PtrToStringUni(Marshal.ReadIntPtr(arguments,i*IntPtr.Size));
                if(arg=="--type"||arg.StartsWith("--type=",StringComparison.OrdinalIgnoreCase)||arg=="--crashpad-handler")return false;
                // 部分 Electron 应用复用自身 EXE 执行 Node 后台服务，它们没有 Chromium --type 标记。
                if(arg=="--stdio"||arg=="--prewarm"||arg.StartsWith("--prewarm-id=",StringComparison.OrdinalIgnoreCase))return false;
            }
            return true;
        }finally{if(arguments!=IntPtr.Zero)LocalFree(arguments);if(buffer!=IntPtr.Zero)Marshal.FreeHGlobal(buffer);CloseHandle(process);}
    }
    static void RefreshOwners(string exe){
        owners.Clear();mainOwners.Clear();unknownOwners.Clear();int session=Process.GetCurrentProcess().SessionId;
        foreach(var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(exe)))using(process){try{
            if(process.SessionId!=session||!String.Equals(process.MainModule.FileName,exe,StringComparison.OrdinalIgnoreCase))continue;
            owners.Add(process.Id);bool? main=electron?IsMainProcess(process.Id):true;
            if(main==true)mainOwners.Add(process.Id);else if(main==null&&!process.HasExited)unknownOwners.Add(process.Id);
        }catch{}}
    }
    static bool Owner(IntPtr window,string exe,out int pid){
        uint value;GetWindowThreadProcessId(window,out value);pid=(int)value;
        return mainOwners.Contains(pid);
    }
    static bool Candidate(IntPtr window,string exe,string title,out int pid,out Rect bounds){
        bounds=new Rect();pid=0;
        if(!String.IsNullOrEmpty(classFilter)){var type=new StringBuilder(256);GetClassName(window,type,256);if(!String.Equals(type.ToString(),classFilter,StringComparison.Ordinal))return false;}
        if((GetWindowLong(window,-20)&0x80)!=0||GetWindow(window,4)!=IntPtr.Zero||!Owner(window,exe,out pid))return false;
        var text=new StringBuilder(512);GetWindowText(window,text,512);
        if(String.IsNullOrWhiteSpace(text.ToString())||(!String.IsNullOrEmpty(title)&&text.ToString().IndexOf(title,StringComparison.OrdinalIgnoreCase)<0))return false;
        var placement=new Placement();placement.Length=Marshal.SizeOf(placement);
        if(IsIconic(window)&&GetWindowPlacement(window,ref placement))bounds=placement.Normal;else GetWindowRect(window,out bounds);
        return bounds.Right-bounds.Left>=320&&bounds.Bottom-bounds.Top>=200;
    }
    static object State(string exe,string title,bool activate){
        IntPtr chosen=IntPtr.Zero;Rect bounds=new Rect();int pid=0;long score=0;bool running=false;
        RefreshOwners(exe);running=mainOwners.Count>0;foreach(int owner in mainOwners)if(pid==0||owner<pid)pid=owner;
        EnumWindows((window,data)=>{int owner;Rect rect;if(Candidate(window,exe,title,out owner,out rect)){long area=(long)(rect.Right-rect.Left)*(rect.Bottom-rect.Top);if(IsWindowVisible(window))area+=(1L<<40);if(area>score){score=area;chosen=window;bounds=rect;pid=owner;}}return true;},IntPtr.Zero);
        bool found=chosen!=IntPtr.Zero,visible=found&&IsWindowVisible(chosen),minimized=found&&IsIconic(chosen);
        Rect clientBounds=new Rect();Point clientOrigin=new Point();
        if(found&&!minimized){GetClientRect(chosen,out clientBounds);ClientToScreen(chosen,ref clientOrigin);}
        if(activate&&found){if(minimized)ShowWindow(chosen,9);else if(!visible)ShowWindow(chosen,5);SetForegroundWindow(chosen);}
        return new {running=running,mainProcessIds=new List<int>(mainOwners),helperCount=owners.Count-mainOwners.Count-unknownOwners.Count,unknownProcessIds=unknownOwners,found=found,foreground=found&&GetForegroundWindow()==chosen,handle=chosen.ToInt64().ToString(),pid=pid,visible=visible,minimized=minimized,x=bounds.Left,y=bounds.Top,width=bounds.Right-bounds.Left,height=bounds.Bottom-bounds.Top,clientX=clientOrigin.X,clientY=clientOrigin.Y,clientWidth=clientBounds.Right,clientHeight=clientBounds.Bottom};
    }
    WindowHost(string exe,string path,string filter){
        executable=exe;signal=path;title=filter;
        callback=(h,e,w,o,c,t,tm)=>{if(o==0&&c==0){uint pid;GetWindowThreadProcessId(w,out pid);if(!owners.Contains((int)pid))RefreshOwners(executable);Protect(w);}};
        hook=SetWinEventHook(0x8000,0x8002,IntPtr.Zero,callback,0,0,2);
        RefreshOwners(executable);Sweep();File.WriteAllText(signal+".armed","armed");
        long refreshed=0;timer.Tick+=(s,e)=>{if(clock.ElapsedMilliseconds-refreshed>500){RefreshOwners(executable);refreshed=clock.ElapsedMilliseconds;}Sweep();if(File.Exists(signal+".release")||clock.ElapsedMilliseconds>90000)Finish();};timer.Start();
        Application.ApplicationExit+=(s,e)=>Restore();
    }
    void Sweep(){EnumWindows((window,data)=>{Protect(window);return true;},IntPtr.Zero);}
    void Protect(IntPtr window){
        int pid;Rect bounds;if(done||!Candidate(window,executable,title,out pid,out bounds))return;
        if(!saved.ContainsKey(window)||saved[window].Pid!=pid){var state=new Saved();state.Pid=pid;state.Style=GetWindowLong(window,-20);state.Layered=GetLayeredWindowAttributes(window,out state.Color,out state.Alpha,out state.Flags);saved[window]=state;}
        SetWindowLong(window,-20,saved[window].Style|0x80000);SetLayeredWindowAttributes(window,0,0,2);
    }
    void Restore(){foreach(var item in saved)if(IsWindow(item.Key)){var value=item.Value;uint pid;GetWindowThreadProcessId(item.Key,out pid);if(pid!=value.Pid)continue;if(value.Layered)SetLayeredWindowAttributes(item.Key,value.Color,value.Alpha,value.Flags);else SetLayeredWindowAttributes(item.Key,0,255,2);SetWindowLong(item.Key,-20,value.Style);}}
    void Finish(){if(done)return;done=true;timer.Stop();Restore();if(hook!=IntPtr.Zero)UnhookWinEvent(hook);File.WriteAllText(signal+".done","done");timer.Dispose();ExitThread();}
    [STAThread] static int Main(string[] args){
        if(args.Length<1)return 2;
        try{SetProcessDpiAwarenessContext(new IntPtr(-4));}catch{}
        try{
            if(args[0]=="list"){Console.OutputEncoding=Encoding.UTF8;Console.WriteLine(new JavaScriptSerializer().Serialize(ListWindows()));return 0;}
            if(args.Length<2)return 2;
            string exe=Path.GetFullPath(args[1]);
            int kindIndex=args[0]=="guard"?4:3;electron=args.Length>kindIndex&&args[kindIndex]!="native";
            classFilter=args.Length>kindIndex+1?args[kindIndex+1]:"";
            if(args[0]=="guard"){if(args.Length<3)return 2;Application.Run(new WindowHost(exe,args[2],args.Length>3?args[3]:""));}
            else Console.WriteLine(new JavaScriptSerializer().Serialize(State(exe,args.Length>2?args[2]:"",args[0]=="activate")));
            return 0;
        }catch(Exception error){Console.Error.WriteLine(error.Message);return 1;}
    }
}
