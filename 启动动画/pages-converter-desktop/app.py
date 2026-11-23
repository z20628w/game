"""Pages 文档转换桌面界面。"""
import argparse
import ctypes
import json
import os
import queue
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from engine import ConversionCancelled, app_folder, convert_document, engine_path

NAVY = '#142D43'
BLUE = '#2563EB'
BG = '#F1F5F9'
INK = '#172B3A'
MUTED = '#60758A'


class ConverterApp:
    def __init__(self, root, initial_files=(), initial_output=None):
        self.root = root
        self.root.title('Pages 文档转换')
        self.root.configure(bg=BG)
        width = min(1120, root.winfo_screenwidth()-60)
        height = min(820, root.winfo_screenheight()-90)
        self.root.geometry(f'{width}x{height}')
        self.root.minsize(980, 720)
        icon = Path(getattr(sys, '_MEIPASS', app_folder())) / 'app.ico'
        if icon.is_file():
            self.root.iconbitmap(str(icon))
        self.items = {}
        self.events = queue.Queue()
        self.cancel = threading.Event()
        self.busy = False
        self.closing = False
        self.config_path = Path(os.getenv('LOCALAPPDATA', str(Path.home()))) / 'PagesConverter/settings.json'
        try:
            settings = json.loads(self.config_path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            settings = {}
        self.format = tk.StringVar(value=settings.get('format', 'PDF'))
        if self.format.get() not in ('PDF', 'Word', 'PDF + Word'):
            self.format.set('PDF')
        self.output = tk.StringVar(value=str(initial_output or settings.get('output') or Path.home() / 'Documents/Pages转换结果'))
        self.fix_heights = tk.BooleanVar(value=True)
        self.status = tk.StringVar(value='添加文档后即可开始转换')
        self.count = tk.StringVar(value='0 个文件')
        self.details = tk.StringVar(value='支持 .pages 文件。可以一次添加多个，原文件不会被修改。')
        self.controls = []
        self._styles()
        self._layout()
        self.add_paths(initial_files)
        self.root.protocol('WM_DELETE_WINDOW', self.close)
        self.root.bind('<Control-o>', lambda event: self.choose_files() if not self.busy else None)
        self.root.after(100, self.poll)

    def _styles(self):
        style = ttk.Style(self.root)
        style.theme_use('clam')
        style.configure('.', font=('Microsoft YaHei UI', 10))
        style.configure('TButton', padding=(14, 9), background='#E8EEF6', foreground=INK, borderwidth=0)
        style.map('TButton', background=[('active', '#DCE6F2'), ('disabled', '#EDF1F5')], foreground=[('disabled', '#9BAABB')])
        style.configure('Primary.TButton', background=BLUE, foreground='white', padding=(24, 12), font=('Microsoft YaHei UI', 11, 'bold'))
        style.map('Primary.TButton', background=[('active', '#1D4ED8'), ('disabled', '#BED0EA')], foreground=[('disabled', 'white')])
        style.configure('Treeview', background='white', fieldbackground='white', foreground=INK, rowheight=42, borderwidth=0)
        style.configure('Treeview.Heading', background='#F5F8FC', foreground=MUTED, padding=(12, 10), font=('Microsoft YaHei UI', 9, 'bold'), relief='flat')
        style.map('Treeview', background=[('selected', '#E3EDFF')], foreground=[('selected', '#153D7A')])
        style.configure('TRadiobutton', background='white', foreground=INK, padding=(4, 5))
        style.configure('TCheckbutton', background='white', foreground=MUTED, padding=(0, 4))
        style.configure('TEntry', padding=(10, 9), fieldbackground='#F8FAFD', bordercolor='#D9E3EE')
        style.configure('Horizontal.TProgressbar', background=BLUE, troughcolor='#DDE7F3', borderwidth=0, thickness=5)

    def label(self, parent, text='', **kwargs):
        return tk.Label(parent, text=text, bg=parent.cget('bg'), fg=INK, font=('Microsoft YaHei UI', 10), **kwargs)

    def _layout(self):
        header = tk.Frame(self.root, bg=NAVY, padx=30, pady=24)
        header.pack(fill='x')
        tk.Label(header, text='Pages 文档转换', font=('Microsoft YaHei UI', 23, 'bold'), bg=NAVY, fg='white').pack(anchor='w')
        tk.Label(header, text='把苹果文档，转换为随时可用的 PDF 和 Word。', font=('Microsoft YaHei UI', 10), bg=NAVY, fg='#B8CDDF').pack(anchor='w', pady=(7, 0))
        badge = tk.Label(header, text='●  本地转换 · 无需联网', font=('Microsoft YaHei UI', 10), bg='#20435A', fg='#ACF0D1', padx=14, pady=8)
        badge.place(relx=1, x=0, y=8, anchor='ne')
        main = tk.Frame(self.root, bg=BG, padx=26, pady=20)
        main.pack(fill='both', expand=True)
        main.columnconfigure(0, weight=1)
        main.rowconfigure(0, weight=1)

        card = tk.Frame(main, bg='white', padx=18, pady=15, highlightbackground='#DCE5EE', highlightthickness=1)
        card.grid(row=0, column=0, sticky='nsew')
        card.columnconfigure(0, weight=1)
        card.rowconfigure(1, weight=1)
        tools = tk.Frame(card, bg='white')
        tools.grid(row=0, column=0, columnspan=2, sticky='ew', pady=(0, 12))
        self.label(tools, '待转换文件').pack(side='left')
        self.label(tools, textvariable=self.count, padx=12).pack(side='left')
        self.clear_btn = ttk.Button(tools, text='清空列表', command=self.clear)
        self.clear_btn.pack(side='right')
        self.remove_btn = ttk.Button(tools, text='移除所选', command=self.remove)
        self.remove_btn.pack(side='right', padx=8)
        self.add_btn = ttk.Button(tools, text='＋ 添加文件', command=self.choose_files)
        self.add_btn.pack(side='right')
        self.controls.extend([self.add_btn, self.remove_btn, self.clear_btn])
        self.tree = ttk.Treeview(card, columns=('name', 'size', 'status'), show='headings', height=5, selectmode='extended')
        for column, name in [('name', '文件名称'), ('size', '大小'), ('status', '状态')]:
            self.tree.heading(column, text=name, anchor='w')
        self.tree.column('name', width=490, minwidth=300, stretch=True)
        self.tree.column('size', width=90, minwidth=80, stretch=False)
        self.tree.column('status', width=245, minwidth=220, stretch=False)
        self.tree.grid(row=1, column=0, sticky='nsew')
        scroll = ttk.Scrollbar(card, orient='vertical', command=self.tree.yview)
        scroll.grid(row=1, column=1, sticky='ns')
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.tag_configure('done', foreground='#1A8062')
        self.tree.tag_configure('warning', foreground='#996318')
        self.tree.tag_configure('error', foreground='#BB3434')
        self.tree.bind('<<TreeviewSelect>>', self.show_details)
        self.tree.bind('<Double-1>', lambda event: self.open_result())
        self.detail_label = tk.Label(card, textvariable=self.details, font=('Microsoft YaHei UI', 9),
                                     bg='white', fg=MUTED, anchor='w', justify='left', wraplength=950, height=3)
        self.detail_label.grid(row=2, column=0, columnspan=2, sticky='ew', pady=(8, 0))
        card.bind('<Configure>', lambda event: self.detail_label.configure(wraplength=max(300,event.width-40)))

        options = tk.Frame(main, bg='white', padx=20, pady=14, highlightbackground='#DCE5EE', highlightthickness=1)
        options.grid(row=1, column=0, sticky='ew', pady=(14, 0))
        options.columnconfigure(1, weight=1)
        self.label(options, '输出格式').grid(row=0, column=0, sticky='w', padx=(0, 24))
        radios = tk.Frame(options, bg='white')
        radios.grid(row=0, column=1, sticky='w')
        for value, title in [('PDF', 'PDF 文档'), ('Word', 'Word 文档'), ('PDF + Word', '同时导出两种')]:
            radio = ttk.Radiobutton(radios, text=title, value=value, variable=self.format)
            radio.pack(side='left', padx=(0, 22))
            self.controls.append(radio)
        self.label(options, '保存位置').grid(row=1, column=0, sticky='w', pady=(12, 0))
        output_entry = ttk.Entry(options, textvariable=self.output)
        output_entry.grid(row=1, column=1, sticky='ew', pady=(12, 0))
        browse = ttk.Button(options, text='选择文件夹', command=self.choose_folder)
        browse.grid(row=1, column=2, padx=(12, 0), pady=(12, 0))
        self.controls.extend([output_entry, browse])
        check = ttk.Checkbutton(options, text='自动调整表格行高，减少文字被截断', variable=self.fix_heights)
        check.grid(row=2, column=1, columnspan=2, sticky='w', pady=(8, 0))
        self.controls.append(check)

        footer = tk.Frame(main, bg=BG)
        footer.grid(row=2, column=0, sticky='ew', pady=(16, 0))
        footer.columnconfigure(0, weight=1)
        self.status_label = tk.Label(footer, textvariable=self.status, bg=BG, fg=MUTED, anchor='w', font=('Microsoft YaHei UI', 10))
        self.status_label.grid(row=0, column=0, sticky='ew')
        self.progress = ttk.Progressbar(footer, mode='indeterminate')
        self.progress.grid(row=1, column=0, sticky='ew', pady=(10, 0), padx=(0, 20))
        actions = tk.Frame(footer, bg=BG)
        actions.grid(row=0, column=1, rowspan=2, sticky='e')
        self.cancel_btn = ttk.Button(actions, text='取消', command=self.request_cancel, state='disabled')
        self.cancel_btn.pack(side='left', padx=6)
        ttk.Button(actions, text='打开结果', command=self.open_result).pack(side='left', padx=6)
        ttk.Button(actions, text='打开文件夹', command=self.open_folder).pack(side='left', padx=6)
        self.start_btn = ttk.Button(actions, text='开始转换', style='Primary.TButton', command=self.start)
        self.start_btn.pack(side='left', padx=(10, 0))
        tk.Label(main, text='原文件保持不变，同名结果自动另存。复杂表格与分页请在转换后复核。',
                 bg=BG, fg='#7D8EA0', font=('Microsoft YaHei UI', 9)).grid(row=3, column=0, sticky='w', pady=(14, 0))

    def choose_files(self):
        paths = filedialog.askopenfilenames(parent=self.root, title='选择 Pages 文档', filetypes=[('Pages 文档', '*.pages')])
        self.add_paths(paths)

    def add_paths(self, paths):
        existing = {str(item['path']).lower() for item in self.items.values()}
        for path in paths:
            candidate = Path(path).resolve()
            if not candidate.is_file() or candidate.suffix.lower() != '.pages' or str(candidate).lower() in existing:
                continue
            item_id = self.tree.insert('', 'end', values=(candidate.name, f'{candidate.stat().st_size/1024:.0f} KB', '等待转换'))
            self.items[item_id] = {'path': candidate, 'state': 'pending', 'files': [], 'detail': str(candidate)}
            existing.add(str(candidate).lower())
        self.count.set(f'{len(self.items)} 个文件')
        if self.items:
            self.status.set(f'已添加 {len(self.items)} 个文件，选择格式后开始转换')

    def choose_folder(self):
        result = filedialog.askdirectory(parent=self.root, title='选择保存位置', initialdir=self.output.get() if Path(self.output.get()).is_dir() else str(Path.home()))
        if result:
            self.output.set(result)

    def remove(self):
        if self.busy:
            return
        for item_id in self.tree.selection():
            self.tree.delete(item_id)
            self.items.pop(item_id, None)
        self.count.set(f'{len(self.items)} 个文件')
        self.details.set('仅从列表移除，不会删除文件。')

    def clear(self):
        if self.busy:
            return
        for item_id in list(self.items):
            self.tree.delete(item_id)
        self.items.clear()
        self.count.set('0 个文件')
        self.status.set('添加文档后即可开始转换')
        self.details.set('支持 .pages 文件。可以一次添加多个，原文件不会被修改。')

    def show_details(self, event=None):
        selected = self.tree.selection()
        if selected:
            self.details.set(self.items[selected[0]]['detail'])

    def set_busy(self, busy):
        self.busy = busy
        for widget in self.controls:
            widget.configure(state='disabled' if busy else 'normal')
        self.start_btn.configure(state='disabled' if busy else 'normal')
        self.cancel_btn.configure(state='normal' if busy else 'disabled')
        if busy:
            self.progress.start(10)
        else:
            self.progress.stop()
            self.progress['value'] = 0

    def start(self):
        if self.busy:
            return
        if not self.items:
            self.choose_files()
            if not self.items:
                return
        if not self.output.get().strip():
            messagebox.showinfo('请选择保存位置', '先选择转换结果的保存文件夹。', parent=self.root)
            return
        try:
            destination = Path(self.output.get()).expanduser().resolve()
            destination.mkdir(parents=True, exist_ok=True)
        except (OSError, ValueError) as exc:
            messagebox.showerror('无法开始', str(exc), parent=self.root)
            return
        try:
            self.config_path.parent.mkdir(parents=True, exist_ok=True)
            self.config_path.write_text(json.dumps({'output': str(destination), 'format': self.format.get()}, ensure_ascii=False), encoding='utf-8')
        except OSError:
            pass
        formats = {'PDF': ['pdf'], 'Word': ['docx'], 'PDF + Word': ['pdf', 'docx']}[self.format.get()]
        work = [(item_id, item['path']) for item_id, item in self.items.items()]
        self.cancel.clear()
        self.set_busy(True)
        for item_id, _ in work:
            self.items[item_id].update(state='pending', files=[], detail=str(self.items[item_id]['path']))
            self.tree.set(item_id, 'status', '等待转换')
            self.tree.item(item_id, tags=())
        threading.Thread(target=self.worker, args=(work, destination, formats, self.fix_heights.get()), daemon=True).start()

    def worker(self, work, destination, formats, fix_heights):
        done, failed = 0, 0
        for index, (item_id, path) in enumerate(work, 1):
            if self.cancel.is_set():
                break
            self.events.put(('progress', item_id, f'{index}/{len(work)} · 正在准备…'))
            try:
                result = convert_document(path, destination, formats, fix_heights, self.cancel,
                                          lambda text, current=item_id: self.events.put(('progress', current, f'{index}/{len(work)} · {text}')))
                done += 1
                self.events.put(('done', item_id, result))
            except ConversionCancelled:
                self.events.put(('cancelled', item_id, None))
                break
            except Exception as exc:
                failed += 1
                detail = str(exc) if isinstance(exc, (ValueError, OSError)) else '转换未成功，请检查文件是否完整后重试。'
                self.events.put(('error', item_id, detail))
        self.events.put(('finished', None, {'done': done, 'failed': failed, 'cancelled': self.cancel.is_set()}))

    def poll(self):
        try:
            while True:
                event, item_id, payload = self.events.get_nowait()
                if event == 'progress':
                    self.items[item_id]['state'] = 'running'
                    self.tree.set(item_id, 'status', '转换中…')
                    self.status.set(payload)
                elif event == 'done':
                    item = self.items[item_id]
                    needs_review = payload['table_count'] or payload['unmatched']
                    item.update(state='done', files=payload['files'])
                    item['detail'] = '\n'.join(payload['files']) + '\n' + payload['note']
                    if payload['unmatched']:
                        item['detail'] += f" 有 {payload['unmatched']} 个段落的提取文字未完全匹配，请重点复核。"
                    self.tree.set(item_id, 'status', f"完成 · {payload['pages']} 页" + (' · 请复核' if needs_review else ''))
                    self.tree.item(item_id, tags=('warning' if needs_review else 'done',))
                    self.tree.selection_set(item_id)
                    self.show_details()
                elif event in ('error', 'cancelled'):
                    self.items[item_id].update(state=event, detail=payload or '已取消，原文件保持不变。')
                    self.tree.set(item_id, 'status', '转换失败' if event == 'error' else '已取消')
                    self.tree.item(item_id, tags=('error' if event == 'error' else 'warning',))
                    self.tree.selection_set(item_id)
                    self.show_details()
                elif event == 'finished':
                    for key, item in self.items.items():
                        if item['state'] == 'pending' and payload['cancelled']:
                            item['state'] = 'cancelled'
                            self.tree.set(key, 'status', '未开始 · 已取消')
                    self.set_busy(False)
                    self.status.set(f"{'已停止' if payload['cancelled'] else '处理完成'} · 成功 {payload['done']} 个 · 失败 {payload['failed']} 个")
                    if self.closing:
                        self.root.destroy()
                        return
        except queue.Empty:
            pass
        self.root.after(100, self.poll)

    def request_cancel(self):
        self.cancel.set()
        self.status.set('正在停止转换，请稍候…')
        self.cancel_btn.configure(state='disabled')

    def open_result(self):
        selected = self.tree.selection()
        if not selected:
            self.status.set('请先在列表中选择一个已完成的文件')
            return
        files = self.items[selected[0]]['files']
        if not files:
            self.show_details()
            return
        try:
            if len(files) == 1:
                os.startfile(files[0])
            else:
                os.startfile(str(Path(files[0]).parent))
        except OSError as exc:
            messagebox.showerror('无法打开结果', str(exc), parent=self.root)

    def open_folder(self):
        folder = Path(self.output.get()).expanduser()
        if folder.is_dir():
            try:
                os.startfile(str(folder.resolve()))
            except OSError as exc:
                messagebox.showerror('无法打开文件夹', str(exc), parent=self.root)
        else:
            self.status.set('结果文件夹尚未创建，转换后即可打开')

    def close(self):
        if self.busy:
            if messagebox.askyesno('正在转换', '停止转换并关闭程序？已完成的结果会保留。', parent=self.root):
                self.closing = True
                self.request_cancel()
        else:
            self.root.destroy()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('files', nargs='*')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--verify', type=Path, help=argparse.SUPPRESS)
    parser.add_argument('--report', type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args()
    try:
        import pyi_splash
        pyi_splash.close()
    except ImportError:
        pass
    if args.verify:
        try:
            result = convert_document(args.verify, args.output or Path.cwd(), ['pdf', 'docx'])
            report = {'ok': True, **result}
        except Exception as exc:
            report = {'ok': False, 'error': str(exc)}
        if args.report:
            args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        return 0 if report['ok'] else 1
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except (AttributeError, OSError):
        pass
    root = tk.Tk()
    ConverterApp(root, args.files, args.output)
    root.mainloop()
    return 0


if __name__ == '__main__':
    sys.exit(main())
