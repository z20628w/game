using System;
using System.Diagnostics;
using System.Net;
using System.Runtime.InteropServices;

// 直接读取内核监听表，避免每次点击都启动 NetTCPIP/CIM 查询。
class PortOwner {
    [DllImport("iphlpapi.dll",SetLastError=true)] static extern uint GetExtendedTcpTable(IntPtr table,ref int size,bool order,int family,int kind,uint reserved);
    static int Port(int value){return ((value&255)<<8)|((value>>8)&255);}
    static int Scan(int family,int wanted,string executable,ref int owner){
        int size=0;
        uint result=GetExtendedTcpTable(IntPtr.Zero,ref size,false,family,3,0);
        if(result!=122&&result!=0)return 5;
        for(int attempt=0;attempt<3;attempt++){
            IntPtr table=Marshal.AllocHGlobal(Math.Max(4,size));
            try{
                result=GetExtendedTcpTable(table,ref size,false,family,3,0);
                if(result==122)continue;
                if(result!=0)return 5;
                int count=Marshal.ReadInt32(table),stride=family==2?24:56;
                if(count<0||count>(size-4)/stride)return 5;
                for(int i=0;i<count;i++){
                    IntPtr row=IntPtr.Add(table,4+i*stride);
                    int port=Port(Marshal.ReadInt32(row,family==2?8:20));
                    int pid=Marshal.ReadInt32(row,family==2?20:52);
                    if(port!=wanted||pid<=0)continue;
                    // 保持原有规则：仅接受 IPv4 127.0.0.1，拒绝公开或 IPv6 监听。
                    if(family!=2||!new IPAddress(BitConverter.GetBytes(Marshal.ReadInt32(row,4))).Equals(IPAddress.Loopback))return 4;
                    try{
                        using(var process=Process.GetProcessById(pid)){
                            if(!String.Equals(process.MainModule.FileName,executable,StringComparison.OrdinalIgnoreCase))return 3;
                            owner=pid;
                        }
                    }catch(ArgumentException){continue;}catch{return 5;}
                }
                return 0;
            }finally{Marshal.FreeHGlobal(table);}
        }
        return 5;
    }
    static int Main(string[] args){
        int port;
        if(args.Length!=2||!Int32.TryParse(args[0],out port)||port<1024||port>65535)return 2;
        int owner=0;
        foreach(int family in new[]{2,23}){int error=Scan(family,port,args[1],ref owner);if(error!=0)return error;}
        Console.WriteLine(owner==0?"null":"{\"LocalPort\":"+port+",\"LocalAddress\":\"127.0.0.1\",\"RemotePort\":0,\"OwningProcess\":"+owner+"}");
        return 0;
    }
}
