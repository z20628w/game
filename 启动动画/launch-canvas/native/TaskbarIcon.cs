using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;

class TaskbarIcon {
    [StructLayout(LayoutKind.Sequential)] struct PropertyKey { public Guid Format; public uint Id; public PropertyKey(uint id){Format=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");Id=id;} }
    [StructLayout(LayoutKind.Explicit,Size=24)] struct PropVariant { [FieldOffset(0)] public ushort Type; [FieldOffset(8)] public IntPtr Pointer; }
    [ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IPropertyStore {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int GetAt(uint index,out PropertyKey key);
        [PreserveSig] int GetValue(ref PropertyKey key,out PropVariant value);
        [PreserveSig] int SetValue(ref PropertyKey key,ref PropVariant value);
        [PreserveSig] int Commit();
    }
    [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr window,ref Guid iid,out IPropertyStore store);
    [DllImport("ole32.dll")] static extern int PropVariantClear(ref PropVariant value);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr window,uint message,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result);
    [DllImport("user32.dll",EntryPoint="GetClassLongPtrW")] static extern IntPtr GetClassLongPtr(IntPtr window,int index);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern int GetApplicationUserModelId(IntPtr process,ref uint length,StringBuilder value);
    static string Read(IPropertyStore store,uint id){var key=new PropertyKey(id);PropVariant value;Marshal.ThrowExceptionForHR(store.GetValue(ref key,out value));try{return value.Type==31?Marshal.PtrToStringUni(value.Pointer):"";}finally{PropVariantClear(ref value);}}
    static void Write(IPropertyStore store,uint id,string text){var key=new PropertyKey(id);var value=new PropVariant();value.Type=31;value.Pointer=Marshal.StringToCoTaskMemUni(text);try{Marshal.ThrowExceptionForHR(store.SetValue(ref key,ref value));}finally{PropVariantClear(ref value);}}
    static long Icon(IntPtr window,int size){IntPtr result;SendMessageTimeout(window,0x7f,new IntPtr(size),IntPtr.Zero,2,1000,out result);return result.ToInt64();}
    [STAThread] static int Main(string[] args){
        Console.OutputEncoding=new UTF8Encoding(false);
        try{
            if(args.Length<3)throw new Exception("需要操作、目标程序与窗口句柄");
            var window=new IntPtr(long.Parse(args[2]));uint pid;GetWindowThreadProcessId(window,out pid);
            using(var process=Process.GetProcessById((int)pid)){
                if(process.SessionId!=Process.GetCurrentProcess().SessionId||!String.Equals(Path.GetFullPath(args[1]),process.MainModule.FileName,StringComparison.OrdinalIgnoreCase))throw new Exception("窗口归属不匹配");
                var iid=typeof(IPropertyStore).GUID;IPropertyStore store;Marshal.ThrowExceptionForHR(SHGetPropertyStoreForWindow(window,ref iid,out store));
                try{
                    if(args[0]=="repair"){
                        if(args.Length!=6||!File.Exists(args[3])||!String.Equals(Path.GetExtension(args[3]),".ico",StringComparison.OrdinalIgnoreCase)||String.IsNullOrWhiteSpace(args[4])||String.IsNullOrWhiteSpace(args[5]))throw new Exception("任务栏图标或启动身份无效");
                        // 按 Shell 要求先写重新启动信息，最后设置窗口身份；不改进程、窗口样式或背景接口。
                        var keys=new uint[]{2,3,4,5};var previous=new PropVariant[keys.Length];for(int i=0;i<keys.Length;i++){var key=new PropertyKey(keys[i]);Marshal.ThrowExceptionForHR(store.GetValue(ref key,out previous[i]));}
                        try{Write(store,2,args[5]);Write(store,3,Path.GetFullPath(args[3])+",0");Write(store,4,"Codex");Write(store,5,args[4]);Marshal.ThrowExceptionForHR(store.Commit());}
                        catch{for(int i=0;i<keys.Length;i++){var key=new PropertyKey(keys[i]);store.SetValue(ref key,ref previous[i]);}throw;}
                        finally{for(int i=0;i<keys.Length;i++)PropVariantClear(ref previous[i]);}
                    }else if(args[0]!="inspect")throw new Exception("不支持的操作");
                    uint length=1024;var appId=new StringBuilder((int)length);int identityResult=GetApplicationUserModelId(process.Handle,ref length,appId);
                    Console.WriteLine(new JavaScriptSerializer().Serialize(new {pid=pid,windowId=Read(store,5),processId=identityResult==0?appId.ToString():"",identityResult=identityResult,relaunchIcon=Read(store,3),relaunchCommand=Read(store,2),smallIcon=Icon(window,0),largeIcon=Icon(window,1),classIcon=GetClassLongPtr(window,-14).ToInt64()}));
                }finally{Marshal.ReleaseComObject(store);}
            }
            return 0;
        }catch(Exception error){Console.Error.WriteLine(error.Message);return 1;}
    }
}
