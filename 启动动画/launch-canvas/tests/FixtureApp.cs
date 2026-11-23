using System;
using System.Diagnostics;
using System.Threading;
using System.Windows.Forms;
class FixtureApp {
    [STAThread] static void Main(string[] args){
        foreach(string arg in args)if(arg.StartsWith("--type=")||arg=="--stdio"||arg=="--prewarm"){Thread.Sleep(120000);return;}
        string signal=args.Length>0?args[0]:"";
        bool replacement=Array.IndexOf(args,"--replacement")>=0,linger=false;
        bool created;using(var single=new Mutex(true,"Local\\LaunchCanvasFixtureApplication"+(replacement?"Replacement":""),out created)){
            if(!created){if(signal!=""){
                if(System.IO.File.Exists(signal+".replace-on-reopen")){System.IO.File.Delete(signal+".replace-on-reopen");System.IO.File.WriteAllText(signal+".replace","replace");}
                else if(System.IO.File.Exists(signal+".exit-on-reopen")){System.IO.File.Delete(signal+".exit-on-reopen");System.IO.File.WriteAllText(signal+".quit","quit");}
                else if(System.IO.File.Exists(signal+".ignore-reopen"))System.IO.File.Delete(signal+".ignore-reopen");
                else System.IO.File.WriteAllText(signal+".show","show");
            }return;}
            var form=new Form {Text="LaunchCanvas Test Application",Width=900,Height=620};
            form.Controls.Add(new Label {Text="Independent test window",Dock=DockStyle.Fill,TextAlign=System.Drawing.ContentAlignment.MiddleCenter});
            var timer=new System.Windows.Forms.Timer{Interval=30};timer.Tick+=(s,e)=>{if(signal!=""&&System.IO.File.Exists(signal+".replace")){System.IO.File.Delete(signal+".replace");Process.Start(new ProcessStartInfo(Application.ExecutablePath,"\""+signal+"\" --replacement"){UseShellExecute=false});linger=true;form.Close();return;}if(signal!=""&&System.IO.File.Exists(signal+".quit")){System.IO.File.Delete(signal+".quit");Application.Exit();}if(signal!=""&&System.IO.File.Exists(signal+".hide")){System.IO.File.Delete(signal+".hide");form.Hide();}if(signal!=""&&System.IO.File.Exists(signal+".show")){System.IO.File.Delete(signal+".show");form.Show();}};timer.Start();
            Application.Run(form);
            if(linger)Thread.Sleep(8000);
        }
    }
}
