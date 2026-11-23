/* 酒店经营数据自动化 · 控制台前端
   无框架、无 CDN 依赖（本机离线可用）。状态集中在 state 里，
   渲染函数只读 state，改完再 render，避免各处直接操作 DOM 导致状态漂移。 */

(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const state = {
    snapshot: null,
    stages: [],
    runs: {},            // stage -> {status, exit_code, duration}
    job: null,           // {id, since}
    jobData: null,
    tab: "scene",
    report: null,
    table: null,
    findingFilter: "all",
    poll: null,
    railBuilt: false,
    scene: {
      mounted: false,
      graph: null,
      sig: null,         // 数据指纹：没变就不重复建图（建图要读库）
      filter: "all",
      rotate: false,
      selected: null,
    },
  };

  // ============================ 基础 ============================

  async function api(path, options) {
    const res = await fetch(path, options);
    if (!res.ok) {
      let msg = "HTTP " + res.status;
      try {
        const body = await res.json();
        if (body && body.error) msg = body.error;
      } catch (e) { /* 非 JSON 错误体 */ }
      throw new Error(msg);
    }
    return res.json();
  }

  let toastTimer = null;
  function toast(message, kind) {
    const el = $("#toast");
    el.textContent = message;
    el.className = "toast show" + (kind ? " is-" + kind : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = "toast"; }, 4200);
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function emptyBox(message, isError) {
    return '<div class="empty' + (isError ? " empty-err" : "") + '">' +
      escapeHtml(message) + "</div>";
  }

  function bytes(n) {
    if (n == null) return "—";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }

  function num(n) {
    return n == null ? "—" : Number(n).toLocaleString("zh-CN");
  }

  // ============================ 顶栏 ============================

  function renderChips(snap) {
    const chips = [];
    chips.push('<span class="chip">酒店 <b>' + escapeHtml(snap.hotel || "—") + "</b></span>");
    chips.push('<span class="chip">业务日期 <b>' + escapeHtml(snap.biz_date || "无数据") + "</b></span>");
    chips.push('<span class="chip">原始文件 <b>' + num(snap.raw_files) + "</b></span>");

    if (snap.findings) {
      const f = snap.findings;
      const kind = f.block > 0 ? "is-block" : (f.warn > 0 ? "is-warn" : "is-ok");
      chips.push('<span class="chip ' + kind + '">校验 <b>' +
        f.passed + "/" + f.total + "</b> 通过" +
        (f.block ? " · 阻断 " + f.block : "") +
        (f.warn ? " · 提示 " + f.warn : "") + "</span>");
    }

    if (snap.approval === "approved") {
      chips.push('<span class="chip is-ok"><span class="chip-dot" style="background:currentColor"></span>已签字 <b>' +
        escapeHtml(snap.reviewer || "") + "</b></span>");
    } else {
      chips.push('<span class="chip">审批 <b>未批准</b></span>');
    }

    if (snap.db_error) {
      chips.push('<span class="chip is-warn">' + escapeHtml(snap.db_error) + "</span>");
    }

    $("#chips").innerHTML = chips.join("");
  }

  function renderRoles(snap) {
    const sel = $("#role-select");
    if (sel.options.length) {
      sel.value = sel.value || snap.default_role;
      return;
    }
    sel.innerHTML = (snap.roles || []).map(function (r) {
      const label = {
        admin: "admin（全部权限）",
        extractor: "extractor（取数岗）",
        analyst: "analyst（数据岗）",
        finance_reviewer: "finance_reviewer（财务复核岗）",
      }[r] || r;
      return '<option value="' + escapeHtml(r) + '">' + escapeHtml(label) + "</option>";
    }).join("");
    sel.value = snap.default_role || "admin";
  }

  // ============================ 左侧管道 ============================

  function optionInput(stageKey, opt) {
    const id = "opt-" + stageKey + "-" + opt.flag.replace(/^-+/, "");
    const label = '<span>' + escapeHtml(opt.label) + "</span>";
    let input;
    if (opt.type === "bool") {
      input = '<input type="checkbox" id="' + id + '" data-flag="' + opt.flag + '"' +
        (opt.default ? " checked" : "") + ">";
    } else if (opt.type === "int") {
      input = '<input type="number" id="' + id + '" data-flag="' + opt.flag + '"' +
        ' value="' + escapeHtml(opt.default == null ? "" : opt.default) + '" min="1" max="3650">';
    } else if (opt.type === "date") {
      input = '<input type="date" id="' + id + '" data-flag="' + opt.flag + '"' +
        ' value="' + escapeHtml(opt.default || "") + '">';
    } else {
      input = '<input type="text" id="' + id + '" data-flag="' + opt.flag + '"' +
        ' value="' + escapeHtml(opt.default || "") + '"' +
        (opt.required ? ' placeholder="必填"' : "") + ">";
    }
    const cls = "opt" + (opt.type === "bool" ? " opt-bool" : "");
    return '<label class="' + cls + '">' + input + label + "</label>";
  }

  function stepNode(stage, index) {
    const opts = (stage.options || []).length
      ? '<div class="step-opts">' +
          stage.options.map((o) => optionInput(stage.key, o)).join("") +
          '<button class="btn btn-accent opt-apply" type="button" data-apply="' + stage.key + '">运行</button>' +
        "</div>"
      : "";
    return (
      '<li class="step" data-stage="' + stage.key + '">' +
        '<span class="step-no">' + index + "</span>" +
        '<div class="step-body">' +
          '<div class="step-top">' +
            '<span class="step-label">' + escapeHtml(stage.label) + "</span>" +
            '<span class="pill" data-pill>未运行</span>' +
          "</div>" +
          '<p class="step-hint">' + escapeHtml(stage.hint) + "</p>" +
          opts +
        "</div>" +
        ((stage.options || []).length
          ? '<span></span>'
          : '<button class="btn btn-run" type="button" data-run="' + stage.key + '">运行</button>') +
      "</li>"
    );
  }

  function buildRail(stages) {
    const auto = stages.filter((s) => s.group === "auto");
    const human = stages.filter((s) => s.group === "human");
    $("#steps-auto").innerHTML = auto.map((s, i) => stepNode(s, i + 1)).join("");
    $("#steps-human").innerHTML = human.map((s, i) => stepNode(s, auto.length + i + 1)).join("");
    state.railBuilt = true;
  }

  function renderSources(snap, meta) {
    const list = (meta && meta.sources) || [];
    if (!list.length) {
      $("#sources").innerHTML = "";
      return;
    }
    $("#sources").innerHTML = list.map(function (s) {
      return '<li><span class="src-name" title="' + escapeHtml(s.name || "") + '">' +
        escapeHtml(s.name || s.key) + "</span>" +
        '<span class="pill' + (s.mode === "auto" ? " is-ok" : "") + '">' +
        (s.mode === "auto" ? "自动" : "人工") + "</span>" +
        '<span class="src-key">' + escapeHtml(s.key) + "</span></li>";
    }).join("");
  }

  // 从快照推导每个阶段的既有状态（不依赖本次会话是否跑过）
  function deriveRuns(snap) {
    if (!state.runs.__seeded) {
      const tables = (snap.tables || []).map((t) => t.name);
      const r = state.runs;
      if (snap.raw_files > 0) r.mock = { status: "ok", note: snap.raw_files + " 个文件" };
      if (tables.some((t) => t.startsWith("raw_"))) r.extract = { status: "ok" };
      if (tables.some((t) => t.startsWith("stg_"))) r.transform = { status: "ok" };
      if (snap.lakehouse_files > 0) r.load = { status: "ok", note: snap.lakehouse_files + " 个快照" };
      if ((snap.deliverables || []).length) r.build = { status: "ok", note: snap.deliverables.length + " 个文件" };
      if (snap.findings) {
        r.check = {
          status: snap.findings.block > 0 ? "blocked" : (snap.findings.warn > 0 ? "warn" : "ok"),
          note: "阻断 " + snap.findings.block + " / 提示 " + snap.findings.warn,
        };
      }
      if (snap.approval === "approved") r.approve = { status: "ok", note: snap.reviewer || "" };
      if ((snap.outbox_runs || []).length) {
        r.deliver = { status: "ok", note: snap.outbox_runs[0].files + " 个文件已归档" };
      }
      state.runs.__seeded = true;
    }
    applyRunStates();
  }

  function pillFor(info) {
    if (!info) return '<span class="pill" data-pill>未运行</span>';
    const map = {
      ok: ["is-ok", "完成"],
      warn: ["is-warn", "有提示"],
      running: ["is-running", "运行中"],
      failed: ["is-block", "失败"],
      denied: ["is-block", "权限不足"],
      blocked: ["is-block", "被闸门拦截"],
    };
    const [cls, text] = map[info.status] || ["", info.status];
    const note = info.note ? " · " + info.note
      : (info.duration != null ? " · " + info.duration + "s" : "");
    const spin = info.status === "running" ? '<span class="spin"></span>' : "";
    return '<span class="pill ' + cls + '" data-pill>' + spin +
      escapeHtml(text + note) + "</span>";
  }

  function applyRunStates() {
    $$(".step").forEach(function (li) {
      const info = state.runs[li.dataset.stage];
      const pill = $("[data-pill]", li);
      if (pill) pill.outerHTML = pillFor(info);
      li.className = "step" +
        (info && info.status ? " is-" + info.status : "");
    });
    // 有任务在跑时，禁用所有运行按钮
    const busy = state.jobData && state.jobData.status === "running";
    $$("button[data-run], button[data-apply]").forEach(function (b) { b.disabled = !!busy; });
  }

  function readOptions(stageKey) {
    const li = $('.step[data-stage="' + stageKey + '"]');
    const stage = state.stages.find((s) => s.key === stageKey);
    const args = {};
    const missing = [];
    if (!li || !stage) return { args: args, missing: missing };
    (stage.options || []).forEach(function (opt) {
      const input = li.querySelector('[data-flag="' + opt.flag + '"]');
      if (!input) return;
      if (opt.type === "bool") {
        if (input.checked) args[opt.flag] = true;
        return;
      }
      const v = (input.value || "").trim();
      if (!v) {
        if (opt.required) missing.push(opt.label);
        return;
      }
      args[opt.flag] = v;
    });
    return { args: args, missing: missing };
  }

  async function runStage(stageKey) {
    const got = readOptions(stageKey);
    if (got.missing.length) {
      toast("请先填写：" + got.missing.join("、"), "err");
      const stage = state.stages.find((s) => s.key === stageKey);
      const first = stage.options.find((o) => o.required);
      const input = $('.step[data-stage="' + stageKey + '"] [data-flag="' + first.flag + '"]');
      if (input) input.focus();
      return;
    }
    try {
      const job = await api("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: stageKey,
          role: $("#role-select").value,
          args: got.args,
        }),
      });
      state.job = { id: job.id, since: 0 };
      state.jobData = job;
      state.runs[stageKey] = { status: "running" };
      // 先把运行态推进 3D，再切走 —— 否则切到日志页的这段时间里，
      // 3D 那头的工位还是上一次的样子，回来时会有个明显的「顿一下」。
      syncSceneProcess();
      clearTerm();
      appendLines(job.lines || []);
      state.job.since = job.next || 0;
      switchTab("log");
      applyRunStates();
      startPolling();
    } catch (err) {
      toast(err.message, "err");
    }
  }

  // ============================ 日志 ============================

  function clearTerm() {
    $("#term").innerHTML = "";
  }

  function lineClass(text) {
    if (text.indexOf("$ ") === 0) return "ln-cmd";
    if (text.indexOf("# ") === 0) return "ln-meta";
    if (text.indexOf("⛔") >= 0) return "ln-block";
    if (text.indexOf("⚠") >= 0) return "ln-warn";
    if (text.indexOf("✅") >= 0 || text.indexOf("✓") >= 0 || text.indexOf("全部通过") >= 0) return "ln-ok";
    if (/^={3,}/.test(text)) return "ln-head";
    if (/^[①②③④⑤⑥⑦⑧]/.test(text)) return "ln-head";
    if (/^\s*(规则|校验结果|体检结果|模拟上游|写入)/.test(text)) return "ln-ok";
    return "";
  }

  function appendLines(lines) {
    if (!lines || !lines.length) return;
    const term = $("#term");
    const frag = document.createDocumentFragment();
    lines.forEach(function (text) {
      const div = document.createElement("div");
      div.className = "ln " + lineClass(text);
      div.textContent = text;
      frag.appendChild(div);
    });
    term.appendChild(frag);
    while (term.childNodes.length > 3000) term.removeChild(term.firstChild);
    if ($("#autoscroll").checked) term.scrollTop = term.scrollHeight;
  }

  function renderJobbar() {
    const jobs = (state.snapshot && state.snapshot.recent_jobs) || [];
    if (!jobs.length) {
      $("#jobbar").innerHTML = "";
      return;
    }
    $("#jobbar").innerHTML = jobs.map(function (j) {
      const cls = state.job && state.job.id === j.id ? " active" : "";
      const mark = { ok: "✓", failed: "✗", denied: "⛔", blocked: "⛔", running: "…" }[j.status] || "·";
      return '<button type="button" class="' + cls.trim() + '" data-job="' + j.id + '">' +
        mark + " " + escapeHtml(j.label) + " · " + escapeHtml(j.started_at) + "</button>";
    }).join("");
  }

  async function loadJob(jobId) {
    try {
      const j = await api("/api/job?id=" + encodeURIComponent(jobId) + "&since=0");
      state.job = { id: j.id, since: j.next };
      state.jobData = j;
      clearTerm();
      appendLines(j.lines || []);
      renderJobbar();
      if (j.status === "running") startPolling();
    } catch (err) {
      toast(err.message, "err");
    }
  }

  function startPolling() {
    stopPolling();
    state.poll = setInterval(pollJob, 600);
    pollJob();
  }

  function stopPolling() {
    if (state.poll) { clearInterval(state.poll); state.poll = null; }
  }

  async function pollJob() {
    if (!state.job) return;
    let j;
    try {
      j = await api("/api/job?id=" + encodeURIComponent(state.job.id) + "&since=" + state.job.since);
    } catch (err) {
      stopPolling();
      toast(err.message, "err");
      return;
    }
    state.jobData = j;
    if (j.lines && j.lines.length) {
      appendLines(j.lines);
      state.job.since = j.next;
    }
    // 任务在跑 → 3D 里对应的工位亮起来、颗粒提速；跑完 → 这一层要撤掉。
    syncSceneProcess();
    // 运行中的详情面板里那个「运行此阶段」按钮要变成「运行中…」并禁用，
    // 靠的就是这次重绘。
    if (state.scene.mounted && state.scene.selected) {
      const cur = state.scene.selected;
      if (window.Scene3D) Scene3D.select(cur);
    }
    if (j.status !== "running") {
      stopPolling();
      state.runs[j.stage] = { status: j.status, exit_code: j.exit_code, duration: j.duration };
      if (j.status === "ok") toast(j.label + " 完成（" + j.duration + "s）", "ok");
      else if (j.status === "denied") toast(j.label + " 被拒：当前角色权限不足", "err");
      else if (j.status === "blocked") toast(j.label + " 被复核闸门拦截：存在阻断项", "err");
      else toast(j.label + " 失败（退出码 " + j.exit_code + "）", "err");
      await refreshSnapshot();
    }
    applyRunStates();
    renderJobbar();
  }

  // ============================ 校验结果 ============================

  const TYPE_LABEL = {
    not_null: "缺失", completeness: "完整性", date_freshness: "时效",
    reconcile: "勾稽", non_negative: "越界", deviation: "偏离",
    duplicate: "重复", cross_check: "交叉核对",
  };

  async function loadFindings() {
    const d = state.snapshot && state.snapshot.biz_date;
    if (!d) {
      $("#finding-cards").innerHTML = "";
      $("#finding-filters").innerHTML = "";
      $("#findings-body").innerHTML = emptyBox("还没有数据，先跑一次「一键全流程」或「校验」。");
      return;
    }
    $("#findings-date").textContent = "业务日期 " + d;
    let data;
    try {
      data = await api("/api/findings?date=" + encodeURIComponent(d));
    } catch (err) {
      $("#findings-body").innerHTML = emptyBox(err.message, true);
      return;
    }
    if (data.error) {
      $("#finding-cards").innerHTML = "";
      $("#finding-filters").innerHTML = "";
      $("#findings-body").innerHTML = emptyBox(data.error, true);
      return;
    }
    renderFindings(data);
  }

  function renderFindings(data) {
    const s = data.summary || {};
    const cards = [
      { n: s.total, label: "规则总数" },
      { n: s.passed, label: "通过", cls: "is-ok" },
      { n: s.block, label: "阻断项", cls: s.block ? "is-block" : "" },
      { n: s.warn, label: "提示项", cls: s.warn ? "is-warn" : "" },
    ];
    $("#finding-cards").innerHTML = cards.map(function (c) {
      return '<div class="card ' + (c.cls || "") + '"><div class="card-num">' +
        (c.n == null ? "—" : c.n) + '</div><div class="card-label">' + c.label + "</div></div>";
    }).join("");

    const filters = [
      { key: "all", label: "全部" },
      { key: "block", label: "阻断" },
      { key: "warn", label: "提示" },
      { key: "passed", label: "通过" },
    ];
    $("#finding-filters").innerHTML = filters.map(function (f) {
      return '<button type="button" data-filter="' + f.key + '"' +
        (state.findingFilter === f.key ? ' class="active"' : "") + ">" + f.label + "</button>";
    }).join("");

    const rows = (data.findings || []).filter(function (f) {
      if (state.findingFilter === "block") return f.is_blocker;
      if (state.findingFilter === "warn") return f.is_warning;
      if (state.findingFilter === "passed") return f.passed;
      return true;
    });

    if (!rows.length) {
      $("#findings-body").innerHTML = emptyBox("该筛选下没有记录。");
      return;
    }

    $("#findings-body").innerHTML =
      '<table class="grid"><thead><tr>' +
      "<th>规则</th><th>名称</th><th>类型</th><th>位置</th><th>级别</th><th>判定说明</th>" +
      "</tr></thead><tbody>" +
      rows.map(function (f) {
        const rowCls = f.is_blocker ? "row-block" : (f.is_warning ? "row-warn" : "");
        const sev = f.passed ? '<span class="pill is-ok">通过</span>'
          : (f.is_blocker ? '<span class="pill is-block">阻断</span>'
                          : '<span class="pill is-warn">提示</span>');
        return '<tr class="' + rowCls + '">' +
          '<td class="rule-id">' + escapeHtml(f.rule_id) + "</td>" +
          "<td>" + escapeHtml(f.name) + "</td>" +
          '<td class="mono">' + escapeHtml(TYPE_LABEL[f.type] || f.type) + "</td>" +
          '<td class="mono">' + escapeHtml(f.table) + "</td>" +
          "<td>" + sev + "</td>" +
          "<td>" + escapeHtml(f.passed ? "—" : (f.message || f.reason || "")) + "</td>" +
          "</tr>";
      }).join("") +
      "</tbody></table>";
  }

  // ============================ 报表预览 ============================

  function renderReportPicker(snap) {
    const list = snap.deliverables || [];
    if (!list.length) {
      $("#report-picker").innerHTML = "";
      $("#report-body").innerHTML = emptyBox("还没有交付报表，先跑「成表」。");
      $("#report-note").textContent = "";
      return;
    }
    if (!state.report || !list.some((d) => d.filename === state.report)) {
      state.report = list[0].filename;
    }
    $("#report-picker").innerHTML = list.map(function (d) {
      return '<button type="button" data-report="' + escapeHtml(d.filename) + '"' +
        (state.report === d.filename ? ' class="active"' : "") + ">" +
        escapeHtml(d.title + " · " + d.sheet) + "</button>";
    }).join("");
    const cur = list.find((d) => d.filename === state.report);
    $("#report-note").textContent = cur
      ? cur.filename + " · " + bytes(cur.bytes) + " · " + (cur.cadence === "weekly" ? "周报" : "日报")
      : "";
    loadReport();
  }

  async function loadReport() {
    if (!state.report) return;
    $("#report-body").innerHTML = emptyBox("读取中…");
    let data;
    try {
      data = await api("/api/deliverable?file=" + encodeURIComponent(state.report));
    } catch (err) {
      $("#report-body").innerHTML = emptyBox(err.message, true);
      return;
    }
    if (data.error) {
      $("#report-body").innerHTML = emptyBox(data.error, true);
      return;
    }
    $("#report-body").innerHTML = tableHtml(data);
  }

  // ============================ 数据表 ============================

  const LAYER_ORDER = { "原始层": 0, "清洗层": 1, "报表层": 2, "其他": 3 };

  function renderTablePicker(snap) {
    const list = (snap.tables || []).slice().sort(function (a, b) {
      const la = LAYER_ORDER[a.layer] == null ? 9 : LAYER_ORDER[a.layer];
      const lb = LAYER_ORDER[b.layer] == null ? 9 : LAYER_ORDER[b.layer];
      return la - lb || a.name.localeCompare(b.name);
    });
    if (!list.length) {
      $("#table-picker").innerHTML = "";
      $("#table-body").innerHTML = emptyBox(snap.db_error || "数据库里还没有表。");
      $("#tables-note").textContent = "";
      return;
    }
    if (!state.table || !list.some((t) => t.name === state.table)) {
      const firstMart = list.find((t) => t.name.startsWith("mart_"));
      state.table = (firstMart || list[0]).name;
    }
    $("#table-picker").innerHTML = list.map(function (t) {
      return '<button type="button" data-table="' + escapeHtml(t.name) + '"' +
        (state.table === t.name ? ' class="active"' : "") + '">' +
        escapeHtml(t.name) + " (" + num(t.rows) + ")</button>";
    }).join("");
    const cur = list.find((t) => t.name === state.table);
    $("#tables-note").textContent = cur ? cur.layer + " · 共 " + num(cur.rows) + " 行，预览前 200 行" : "";
    loadTable();
  }

  async function loadTable() {
    if (!state.table) return;
    $("#table-body").innerHTML = emptyBox("读取中…");
    let data;
    try {
      data = await api("/api/table?name=" + encodeURIComponent(state.table) + "&limit=200");
    } catch (err) {
      $("#table-body").innerHTML = emptyBox(err.message, true);
      return;
    }
    if (data.error) {
      $("#table-body").innerHTML = emptyBox(data.error, true);
      return;
    }
    $("#table-body").innerHTML = tableHtml(data);
  }

  function tableHtml(data) {
    const cols = data.columns || [];
    const rows = data.rows || [];
    if (!cols.length) return emptyBox("表是空的。");
    const head = "<thead><tr>" + cols.map(function (c) {
      return "<th>" + escapeHtml(c) + "</th>";
    }).join("") + "</tr></thead>";
    const body = rows.length
      ? "<tbody>" + rows.map(function (r) {
          return "<tr>" + cols.map(function (_, i) {
            const v = r[i] == null ? "" : String(r[i]);
            const numeric = /^-?\d+(\.\d+)?$/.test(v);
            return '<td class="' + (numeric ? "num" : "") + '">' + escapeHtml(v) + "</td>";
          }).join("") + "</tr>";
        }).join("") + "</tbody>"
      : "";
    const foot = rows.length
      ? '<div class="empty" style="padding:10px">显示 ' + rows.length +
        " 行" + (data.total ? " / 共 " + num(data.total) + " 行" : "") + "</div>"
      : "";
    return '<table class="grid">' + head + body + "</table>" + foot;
  }

  // ============================ 待复核清单 ============================

  async function loadReview() {
    const d = state.snapshot && state.snapshot.biz_date;
    if (!d) {
      $("#review-body").innerHTML = emptyBox("还没有数据。");
      return;
    }
    $("#review-note").textContent = d;
    let data;
    try {
      data = await api("/api/review?date=" + encodeURIComponent(d));
    } catch (err) {
      $("#review-body").innerHTML = emptyBox(err.message, true);
      return;
    }
    if (data.error) {
      $("#review-body").innerHTML = emptyBox(data.error, true);
      return;
    }
    $("#review-body").innerHTML = renderMarkdown(data.markdown || "");
  }

  // 只覆盖本项目生成的那几种 Markdown 语法，够用即可，不引库
  function renderMarkdown(text) {
    const lines = text.split(/\r?\n/);
    const out = [];
    let inTable = false, inList = false, inDetails = false, inCode = false;

    function closeAll() {
      if (inList) { out.push("</ul>"); inList = false; }
      if (inTable) { out.push("</tbody></table>"); inTable = false; }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.indexOf("```") === 0) {
        closeAll();
        out.push(inCode ? "</code></pre>" : "<pre><code>");
        inCode = !inCode;
        continue;
      }
      if (inCode) { out.push(escapeHtml(line)); continue; }

      if (trimmed.indexOf("<details") === 0) {
        closeAll();
        inDetails = true;
        out.push("<details><summary>" +
          escapeHtml(trimmed.replace(/<[^>]+>/g, "")) + "</summary>");
        continue;
      }
      if (trimmed.indexOf("</details") === 0) {
        closeAll();
        inDetails = false;
        out.push("</details>");
        continue;
      }

      if (!trimmed) { continue; }

      if (trimmed.indexOf("|") === 0) {
        const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        if (/^[\s\-:|]+$/.test(trimmed)) continue;      // 分隔行
        if (!inTable) {
          closeAll();
          out.push('<table><thead><tr>' + cells.map((c) =>
            "<th>" + inline(c) + "</th>").join("") + "</tr></thead><tbody>");
          inTable = true;
        } else {
          out.push("<tr>" + cells.map((c) => "<td>" + inline(c) + "</td>").join("") + "</tr>");
        }
        continue;
      }
      if (inTable) { closeAll(); }

      if (trimmed.indexOf("- ") === 0) {
        if (!inList) { out.push("<ul>"); inList = true; }
        out.push("<li>" + inline(trimmed.slice(2)) + "</li>");
        continue;
      }
      if (inList) { closeAll(); }

      if (trimmed.indexOf("### ") === 0) { out.push("<h3>" + inline(trimmed.slice(4)) + "</h3>"); continue; }
      if (trimmed.indexOf("## ") === 0) { out.push("<h2>" + inline(trimmed.slice(3)) + "</h2>"); continue; }
      if (trimmed.indexOf("# ") === 0) { out.push("<h1>" + inline(trimmed.slice(2)) + "</h1>"); continue; }
      if (/^---+$/.test(trimmed)) { out.push("<hr>"); continue; }
      if (trimmed.indexOf("> ") === 0) { out.push("<blockquote>" + inline(trimmed.slice(2)) + "</blockquote>"); continue; }

      out.push("<p>" + inline(trimmed) + "</p>");
    }
    if (inCode) out.push("</code></pre>");
    closeAll();
    return out.join("\n");
  }

  function inline(text) {
    let s = escapeHtml(text);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return s;
  }

  // ============================ 审计日志 ============================

  async function loadAudit() {
    $("#audit-body").innerHTML = emptyBox("读取中…");
    let data;
    try {
      data = await api("/api/audit?limit=150");
    } catch (err) {
      $("#audit-body").innerHTML = emptyBox(err.message, true);
      return;
    }
    if (data.error) {
      $("#audit-body").innerHTML = emptyBox(data.error, true);
      return;
    }
    $("#audit-note").textContent = data.file + " · 共 " + num(data.total) + " 条，显示最近 " +
      data.records.length + " 条";
    const rows = data.records || [];
    if (!rows.length) { $("#audit-body").innerHTML = emptyBox("没有记录。"); return; }

    $("#audit-body").innerHTML =
      '<table class="grid"><thead><tr>' +
      "<th>时间</th><th>角色</th><th>动作</th><th>对象</th><th>状态</th><th>详情</th>" +
      "</tr></thead><tbody>" +
      rows.map(function (r) {
        const statusPill = r.status === "ok" ? '<span class="pill is-ok">ok</span>'
          : (r.status === "denied" ? '<span class="pill is-block">denied</span>'
            : (r.status === "block" ? '<span class="pill is-block">block</span>'
              : (r.status === "warn" ? '<span class="pill is-warn">warn</span>'
                : (r.status === "empty" ? '<span class="pill is-warn">empty</span>'
                  : '<span class="pill">' + escapeHtml(r.status || "") + "</span>"))));
        const ts = (r.ts || "").replace("T", " ").slice(0, 19);
        return "<tr>" +
          '<td class="mono">' + escapeHtml(ts) + "</td>" +
          "<td>" + escapeHtml(r.role || "") + "</td>" +
          '<td class="mono">' + escapeHtml(r.action || "") + "</td>" +
          '<td class="mono">' + escapeHtml(r.target || "") + "</td>" +
          "<td>" + statusPill + "</td>" +
          "<td>" + escapeHtml(typeof r.detail === "string" ? r.detail : JSON.stringify(r.detail || "")) + "</td>" +
          "</tr>";
      }).join("") +
      "</tbody></table>";
  }

  // ============================ 3D 全景 ============================

  const LAYER_LABEL = { raw: "原始层", stg: "清洗层", mart: "报表层" };
  const STATUS_LABEL = {
    ok: "通过", warn: "提示", block: "阻断", uncovered: "无规则覆盖",
  };

  // 建图要读库、要扫 SQL，比读快照贵得多。所以先算一个便宜的指纹，
  // 没变化就别重复建图 —— 页面 6 秒一刷，不拦一下会白跑很多次。
  function sceneSignature(snap, node) {
    if (!snap) return null;
    const f = snap.findings || {};
    const ob = (snap.outbox_runs || [])[0] || {};
    return [
      snap.biz_date || "-",
      (snap.tables || []).length,
      (snap.tables || []).reduce((s, t) => s + (t.rows || 0), 0),
      snap.lakehouse_files || 0,
      snap.raw_files || 0,
      (snap.deliverables || []).length,
      // 签字和归档不改变任何一张表，但它们会让闸门抬起来、让最后一段轨道亮起来。
      // 指纹里不带上这两个，签完字回到 3D 会看不到门开 —— 门就是流程的戏眼。
      snap.approval || "none",
      snap.reviewer || "",
      ob.files || 0,
      f.passed + "/" + f.total + "/" + f.block + "/" + f.warn,
      node ? "sel" : "",
    ].join("|");
  }

  async function loadScene(force) {
    if (!state.scene.mounted) return;
    const snap = state.snapshot;
    const sig = sceneSignature(snap);
    if (!force && sig && sig === state.scene.sig && state.scene.graph) return;

    let graph;
    try {
      graph = await api("/api/graph" + (snap && snap.biz_date
        ? "?date=" + encodeURIComponent(snap.biz_date) : ""));
    } catch (err) {
      $("#scene-stats").innerHTML =
        '<span class="is-block">建图失败：' + escapeHtml(err.message) + "</span>";
      return;
    }
    state.scene.sig = sig;
    state.scene.graph = graph;
    Scene3D.setData(graph);
    Scene3D.setFilter(state.scene.filter);
    Scene3D.setAutoRotate(state.scene.rotate);
    renderSceneLegend(graph);
    renderSceneStats(graph);
    // setData 会把 process 之后要用的工位坐标重建一遍，所以运行态必须**在 setData 之后**推。
    syncSceneProcess();
    // 刷新后原来选中的表可能没了，重新对齐一次
    if (state.scene.selected && graph.nodes &&
        graph.nodes.some((n) => n.id === state.scene.selected)) {
      Scene3D.select(state.scene.selected);
    } else {
      state.scene.selected = null;
      renderSceneDetail(null);
    }
  }

  const CN_NUM = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

  function orderedStations(graph) {
    return ((graph && graph.stations) || []).slice().sort((a, b) => a.order - b.order);
  }

  // HUD 里也要有一条「主流程」——3D 里那条高架主轨在等距视角下是斜的，
  // 斜着数第几个工位很累，正着摆一排小圆点补上这个数。
  function renderSceneLegend(graph) {
    if (!graph || graph.ok === false) {
      $("#scene-legend").innerHTML = "";
      return;
    }
    const strip = orderedStations(graph).map(function (s) {
      const cls = "sg is-" + (s.status || "pending") + (s.gate ? " is-gate" : "");
      return '<span class="' + cls + '" title="' +
        escapeHtml(s.label + " · " + (s.note || "")) + '">' +
        (CN_NUM[s.order] || "") + "</span>";
    }).join("");

    $("#scene-legend").innerHTML =
      '<div class="legend-title">主流程（左 → 右）</div>' +
      '<div class="scene-strip">' + strip + "</div>" +
      '<div class="legend-note">高架主轨 = 数据流向，走完的一段亮实线</div>' +
      '<div class="legend-row"><span class="legend-dot"></span>光点 = 正在流动的数据</div>' +
      '<div class="legend-row"><span class="legend-swatch sw-gate"></span>闸门 = 人工签字，未签自动落下</div>' +
      '<div class="legend-title">方块高度与颜色</div>' +
      '<div class="legend-note">高度 = 行数（对数）</div>' +
      '<div class="legend-row"><span class="legend-swatch sw-ok"></span>已完成</div>' +
      '<div class="legend-row"><span class="legend-swatch sw-run"></span>正在运行</div>' +
      '<div class="legend-row"><span class="legend-swatch sw-warn"></span>待确认 / 未运行</div>' +
      '<div class="legend-row"><span class="legend-swatch sw-block"></span>有阻断项</div>';
  }

  function renderSceneStats(graph) {
    const el = $("#scene-stats");
    if (!graph || graph.ok === false) {
      el.innerHTML = '<span class="is-block">' +
        escapeHtml((graph && graph.error) || "暂无数据") + "</span>";
      return;
    }
    const fl = graph.flow || {};
    const sts = orderedStations(graph);
    const total = fl.total || sts.length || 0;
    const done = fl.done || 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const front = fl.frontier_key ? sts.filter((s) => s.key === fl.frontier_key)[0] : null;
    const allDone = total > 0 && done >= total;

    // 比例只说明「还剩多少」，前沿才说明「卡在哪」。两个都给，但前沿优先。
    let head;
    if (allDone) head = '<b class="is-ok">' + done + "/" + total + "</b> 全部走完";
    else if (front) head = "<b>" + done + "/" + total + "</b> 卡在「" +
      escapeHtml(front.label) + "」";
    else head = "<b>" + done + "/" + total + "</b>";

    let html = '<div class="sp-row"><span class="sp-title">主流程</span>' +
      '<span class="sp-bar"><i style="width:' + pct + '%"></i></span>' +
      '<span class="sp-count">' + head + "</span></div>";

    const gate = sts.filter((s) => s.gate)[0];
    if (gate && fl.gate_locked) {
      html += '<div class="sp-line is-block">⛔ 闸门落着：' +
        escapeHtml(gate.label) + " 没签字，交付过不去</div>";
    } else if (gate && fl.approval === "approved") {
      html += '<div class="sp-line is-ok">✓ 闸门已放行' +
        (fl.reviewer ? "（" + escapeHtml(fl.reviewer) + "）" : "") + "</div>";
    }
    if (fl.blocked) {
      html += '<div class="sp-line is-block">⛔ 校验有 ' + fl.blocked + " 条阻断项</div>";
    }

    const s = graph.summary || {};
    html += '<div class="sp-dim">表 <b>' + s.nodes + "</b> · 血缘 <b>" + s.edges +
      "</b> · 行数 <b>" + num(s.rows) + "</b></div>";
    el.innerHTML = html;
  }

  // 「现在跑到哪」是任务态，不是磁盘态：任务一开一停都要把这一层推给 3D，
  // 否则工位永远显示静态的完成/未完成，看不出正在跑什么。
  function syncSceneProcess() {
    if (!window.Scene3D || !state.scene.mounted) return;
    const jd = state.jobData;
    const running = jd && jd.status === "running" && jd.stage ? jd.stage : null;
    Scene3D.setProcess({ stage: running, status: running ? "running" : null });
    if (state.scene.graph) renderSceneStats(state.scene.graph);
  }

  const STATION_STATUS_LABEL = {
    ok: "已完成", running: "正在运行", pending: "未运行",
    warn: "有待确认项", blocked: "被阻断项拦住",
  };

  function renderSceneDetail(n) {
    const el = $("#scene-detail");
    if (!n) {
      el.className = "scene-detail";
      el.innerHTML = "";
      return;
    }
    if (n.kind === "station") return renderStationDetail(n);

    const rows = n.rows == null ? "—" : num(n.rows);
    const st = orderedStations(state.scene.graph).filter((s) => s.key === n.station)[0];
    const sub = [LAYER_LABEL[n.layer] || n.layer, n.domain_label || n.domain,
                 rows + " 行", n.kind === "view" ? "视图" : "表"]
      .filter(Boolean).join(" · ");

    let html = "<h3>" + escapeHtml(n.id) + "</h3>";
    html += '<p class="sd-sub">' + escapeHtml(sub) + "</p><dl>";
    if (st) html += "<dt>由哪一步产出</dt><dd>" + escapeHtml(st.label) + "</dd>";
    if (n.origin) html += "<dt>产出</dt><dd>" + escapeHtml(n.origin) + "</dd>";
    if (n.files != null) html += "<dt>源文件</dt><dd>" + n.files + " 个</dd>";
    html += "<dt>覆盖规则</dt><dd>" +
      (n.rules && n.rules.length ? n.rules.map(escapeHtml).join("、") : "无") + "</dd>";
    if (n.deliverable) {
      html += "<dt>交付</dt><dd>" + escapeHtml(n.deliverable.file) + "</dd>";
    }
    html += "</dl>";

    (n.problems || []).forEach(function (p) {
      html += '<div class="sd-prob' + (p.severity === "warn" ? " is-warn" : "") + '">' +
        "<b>" + escapeHtml(p.rule_id) + "</b> " + escapeHtml(p.message || "") + "</div>";
    });

    html += '<div class="sd-acts">' +
      '<button class="btn btn-apply" type="button" data-scene-open="' +
      escapeHtml(n.id) + '">在数据表里打开</button>' +
      '<button class="btn btn-quiet" type="button" data-scene-focus="' +
      escapeHtml(n.id) + '">聚焦</button>' +
      (st ? '<button class="btn btn-quiet" type="button" data-scene-station="' +
        escapeHtml(st.key) + '">看这一步</button>' : "") +
      "</div>";

    el.innerHTML = html;
    el.className = "scene-detail show";
  }

  // 选中一个工位 = 选中流程的一步。这里要回答三个问题：这一步是干什么的、
  // 走出去什么、现在能不能再跑一次。所以详情里必须带「运行此阶段」——
  // 3D 视图如果不能就地推进流程，它就只是个好看的图。
  function renderStationDetail(st) {
    const el = $("#scene-detail");
    const graph = state.scene.graph || {};
    const fl = graph.flow || {};
    const jd = state.jobData;
    const live = jd && jd.status === "running" && jd.stage === st.key;
    const status = live ? "running" : st.status;
    const isFrontier = fl.frontier_key === st.key;

    const meta = (state.stages || []).filter((s) => s.key === st.key)[0] || {};
    const opts = (meta.options || []).filter((o) => o.required);

    let html = "<h3>" + (CN_NUM[st.order] || "") + " " + escapeHtml(st.label) +
      (st.gate ? ' <span class="sd-tag">人工闸门</span>' : "") + "</h3>";

    const sub = [
      "第 " + (st.order + 1) + " / " + (fl.total || 8) + " 步",
      STATION_STATUS_LABEL[status] || status,
      isFrontier && status !== "ok" ? "流程前沿" : "",
    ].filter(Boolean).join(" · ");
    html += '<p class="sd-sub">' + escapeHtml(sub) + "</p>";

    // 进度条：这一步在整条线上处于什么位置
    const total = fl.total || 8;
    html += '<div class="sd-prog">' + orderedStations(graph).map(function (s) {
      const cls = "sd-seg is-" + (s.status || "pending") +
        (s.key === st.key ? " is-cur" : "") + (s.gate ? " is-gate" : "");
      return '<span class="' + cls + '"></span>';
    }).join("") + "</div>";

    html += "<dl>";
    if (st.note) html += "<dt>产物</dt><dd>" + escapeHtml(st.note) + "</dd>";
    if (st.hint) html += "<dt>这一步做什么</dt><dd>" + escapeHtml(st.hint) + "</dd>";
    if (meta.group) {
      html += "<dt>执行方式</dt><dd>" + (meta.group === "human" ? "人工（要签字）" : "自动") + "</dd>";
    }
    if (st.tables && st.tables.length) {
      html += "<dt>产出表</dt><dd>" + st.tables.length + " 张：" +
        st.tables.slice(0, 6).map(function (t) {
          return '<a href="#" class="sd-link" data-scene-open="' + escapeHtml(t) + '">' +
            escapeHtml(t) + "</a>";
        }).join("、") + (st.tables.length > 6 ? " 等" : "") + "</dd>";
    }
    if (st.gate) {
      html += "<dt>闸门口径</dt><dd>" + (fl.approval === "approved"
        ? "已签字" + (fl.reviewer ? "：" + escapeHtml(fl.reviewer) : "")
        : "未签字 —— 交付这一步走不过去") + "</dd>";
    }
    html += "</dl>";

    if (opts.length) {
      html += '<div class="sd-need">运行前要填：' +
        opts.map((o) => escapeHtml(o.label)).join("、") + "（在左侧阶段卡片里填）</div>";
    }

    html += '<div class="sd-acts">' +
      '<button class="btn btn-apply" type="button" data-scene-run="' +
      escapeHtml(st.key) + '"' + (live ? " disabled" : "") + ">" +
      (live ? "运行中…" : "运行此阶段") + "</button>" +
      '<button class="btn btn-quiet" type="button" data-scene-focus="' +
      escapeHtml("station:" + st.key) + '">聚焦</button>' +
      '<button class="btn btn-quiet" type="button" data-scene-log>看日志</button>' +
      "</div>";

    el.innerHTML = html;
    el.className = "scene-detail show";
  }

  function mountScene() {
    const canvas = $("#scene-canvas");
    if (!canvas || state.scene.mounted) return;
    Scene3D.mount(canvas);
    Scene3D.onSelect(function (n) {
      state.scene.selected = n ? n.id : null;
      renderSceneDetail(n);
    });
    state.scene.mounted = true;
  }

  // ============================ Tab 与刷新 ============================

  const LOADERS = {
    scene: loadScene,
    findings: loadFindings,
    reports: () => renderReportPicker(state.snapshot || {}),
    review: loadReview,
    audit: loadAudit,
    tables: () => renderTablePicker(state.snapshot || {}),
  };

  function switchTab(name) {
    state.tab = name;
    $$("#tabs button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.tab === name);
    });
    $$(".panel").forEach(function (p) {
      p.classList.toggle("active", p.dataset.panel === name);
    });
    // 画布在隐藏时量到的尺寸是 0，切回来的瞬间必须重新量一次；
    // 顺带暂停不可见时的渲染循环，别让它在后台空转。
    if (window.Scene3D) {
      Scene3D.setVisible(name === "scene");
      if (name === "scene") {
        Scene3D.resize();
        // 回到 3D 页签时 loadScene 会因为指纹没变而直接返回，
        // 运行态就只能在这里补一次，否则切回来看到的还是上次的状态。
        syncSceneProcess();
      }
    }
    if (LOADERS[name] && state.snapshot) LOADERS[name]();
  }

  async function refreshSnapshot() {
    const snap = await api("/api/snapshot");
    state.snapshot = snap;
    if (!state.railBuilt) {
      state.stages = snap.stages || [];
      buildRail(state.stages);
    }
    renderChips(snap);
    renderRoles(snap);
    renderJobbar();
    deriveRuns(snap);
    if (["scene", "findings", "reports", "review", "tables"].indexOf(state.tab) >= 0) {
      switchTab(state.tab);
    }
    return snap;
  }

  async function loadMeta() {
    try {
      const meta = await api("/api/meta");
      window.__meta = meta;
      renderSources(state.snapshot || {}, meta);
    } catch (e) { /* meta 不影响主流程 */ }
  }

  // ============================ 事件 ============================

  document.addEventListener("click", function (ev) {
    const t = ev.target;
    const runBtn = t.closest && t.closest("[data-run]");
    if (runBtn) return runStage(runBtn.dataset.run);

    const applyBtn = t.closest && t.closest("[data-apply]");
    if (applyBtn) return runStage(applyBtn.dataset.apply);

    const tab = t.closest && t.closest("#tabs button");
    if (tab) return switchTab(tab.dataset.tab);

    const job = t.closest && t.closest("[data-job]");
    if (job) return loadJob(job.dataset.job);

    const filter = t.closest && t.closest("[data-filter]");
    if (filter) {
      state.findingFilter = filter.dataset.filter;
      return loadFindings();
    }

    const rep = t.closest && t.closest("[data-report]");
    if (rep) {
      state.report = rep.dataset.report;
      return renderReportPicker(state.snapshot || {});
    }

    const tbl = t.closest && t.closest("[data-table]");
    if (tbl) {
      state.table = tbl.dataset.table;
      return renderTablePicker(state.snapshot || {});
    }

    // 3D 场景里选中一张表 → 直接跳到「数据表」页签并选中它，
    // 这是 3D 视图真正有用的地方：看见异常，一点就到明细。
    const openTbl = t.closest && t.closest("[data-scene-open]");
    if (openTbl) {
      state.table = openTbl.dataset.sceneOpen;
      switchTab("tables");
      return;
    }

    const focusNode = t.closest && t.closest("[data-scene-focus]");
    if (focusNode) {
      Scene3D.focus(focusNode.dataset.sceneFocus);
      return;
    }

    // 3D 里选中一个工位后，详情面板能就地推进这一步 —— 复用左侧阶段卡片
    // 那套 runStage，选项仍然从卡片里读，两处入口跑的是同一条命令。
    const sceneRun = t.closest && t.closest("[data-scene-run]");
    if (sceneRun) return runStage(sceneRun.dataset.sceneRun);

    const sceneStation = t.closest && t.closest("[data-scene-station]");
    if (sceneStation) return Scene3D.select("station:" + sceneStation.dataset.sceneStation);

    const sceneLog = t.closest && t.closest("[data-scene-log]");
    if (sceneLog) return switchTab("log");
  });

  document.addEventListener("keydown", function (ev) {
    const input = ev.target;
    if (ev.key === "Enter" && input && input.dataset && input.dataset.flag) {
      const step = input.closest(".step");
      if (step) runStage(step.dataset.stage);
    }
  });

  $("#btn-refresh").addEventListener("click", function () {
    refreshSnapshot().then(() => toast("已刷新", "ok")).catch((e) => toast(e.message, "err"));
  });

  // ---------- 3D 视图控制 ----------

  $("#scene-rotate").addEventListener("click", function () {
    state.scene.rotate = !state.scene.rotate;
    this.setAttribute("aria-pressed", state.scene.rotate ? "true" : "false");
    Scene3D.setAutoRotate(state.scene.rotate);
  });

  $("#scene-filter").addEventListener("click", function () {
    state.scene.filter = state.scene.filter === "problem" ? "all" : "problem";
    this.setAttribute("aria-pressed", state.scene.filter === "problem" ? "true" : "false");
    Scene3D.setFilter(state.scene.filter);
  });

  $("#scene-reset").addEventListener("click", function () {
    Scene3D.resetView();
  });

  // ============================ 启动 ============================

  (async function boot() {
    // 画布先挂上，否则第一次切到 3D 页签时量不到尺寸
    mountScene();
    try {
      await refreshSnapshot();
      await loadMeta();
      renderSources(state.snapshot, window.__meta);
      renderJobbar();
      if (state.tab === "scene") {
        Scene3D.setVisible(true);
        await loadScene(true);
      }
    } catch (err) {
      toast("初始化失败：" + err.message, "err");
      $("#term").innerHTML = emptyBox("无法连接后端：" + err.message, true);
    }
    // 后端有任务在跑就接上它的日志；否则直接把「最近一次任务」的输出摆出来。
    // 空着让人对着一句提示发呆，不如让他一进来就看到上一轮跑成什么样。
    const snap = state.snapshot;
    if (snap && snap.running && snap.running.length) {
      loadJob(snap.running[0]);
    } else if (snap && snap.recent_jobs && snap.recent_jobs.length) {
      loadJob(snap.recent_jobs[0].id);
    }
    setInterval(function () {
      if (state.jobData && state.jobData.status === "running") return;
      refreshSnapshot().catch(function () { /* 静默 */ });
    }, 6000);
  })();
})();
