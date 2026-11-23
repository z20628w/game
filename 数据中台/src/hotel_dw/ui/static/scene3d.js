/* 3D 全景 · 自写透视渲染器 —— 「主流程」视图
   ================================================================
   这一版跟上一版的区别，一句话：
   上一版是**资产地图**（X 轴 = 数据分层），看得到东西在哪，看不到事情在怎么走。
   这一版把 X 轴交给**主流程的 8 个工位**，主轨悬在高处贯穿全线，
   数据颗粒沿轨前进 —— 顺序、进度、卡在哪一步，一眼就能读出来。

   具体表达：
     主轨（离地 292）        数据在这条线上从 ① 走到 ⑧
     走完的一段              实线 + 发亮；没走到的暗 + 虚线
     光点（runner）          当前前沿，停在哪就说明卡在哪
     工位门架 + 底板         主轨穿门而过，一眼看出「一步」
     人工闸门                ⑦ 是实体拦杆：没签字杆就落下，轨道断开，颗粒堆在门前
     方块                    有名字 = 表；没名字 = 这一步的产物（按数量对数给高）

   为什么不用 three.js：
   1. 项目的前提是「零额外依赖、离线可用」。three 的 module 包 1MB+，
      为一个几十个轴对齐长方体的场景引进来不划算，而且要走 CDN 或 vendored 大文件。
   2. 这里的几何全是**轴对齐长方体 + 折线**，本质上是「伪 3D 图」，
      只需求解一个透视投影 + 一次深度排序，几十行数学就够。
   3. 自己画能用 Canvas 的文字渲染直接出中文标签，且截图在任何环境都稳。

   所以这里是：透视相机 + painter 算法（远→近）+ 假光照，
   没有 z-buffer、没有 shader，也不需要 WebGL。
   依赖：无。所有颜色都从 CSS 变量读，跟随明暗主题。
*/

(function (global) {
  "use strict";

  // ---------- 颜色工具 ----------

  function parseColor(text) {
    if (!text) return null;
    const t = text.trim();
    if (t[0] === "#") {
      let h = t.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = t.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(",").map((s) => parseFloat(s));
      return [parts[0], parts[1], parts[2]];
    }
    return null;
  }

  function rgba(rgb, alpha) {
    return "rgba(" + Math.round(rgb[0]) + "," + Math.round(rgb[1]) + "," +
      Math.round(rgb[2]) + "," + alpha + ")";
  }

  function shade(rgb, k, toward) {
    // k>0 提亮（往 toward 混），k<0 压暗
    const t = toward || (k >= 0 ? [255, 255, 255] : [0, 0, 0]);
    const a = Math.abs(k);
    return [
      rgb[0] + (t[0] - rgb[0]) * a,
      rgb[1] + (t[1] - rgb[1]) * a,
      rgb[2] + (t[2] - rgb[2]) * a,
    ];
  }

  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif';

  // ---------- 场景常量（世界坐标，单位随意，只要彼此成比例） ----------

  const BOX_W = 62;        // 方块宽（X）
  const BOX_D = 62;        // 方块进深（Z）
  const STATION_GAP = 216; // 工位间距 —— 这是「流程」的节拍，太挤就不像一步了
  const LANE_GAP = 194;    // 业务域泳道间距（Z）
  const SUB_GAP = 76;      // 同一个格子里多个方块的错位间距
  const FLOOR_Y = -96;     // 地面高度，方块从这里往上长
  const MIN_H = 20;        // 最矮的方块也要看得见
  const MAX_H = 212;       // 最高的方块
  const RAIL_Y = 292;      // 主轨高度：高于最高方块，所以任何俯角下都不会被方块挡住
  const RAIL_HALF = 21;    // 主轨半宽（Z）
  const RAIL_OVER = 138;   // 主轨在首尾两端伸出的长度（留出"进料/出料"的余地）
  const POST_Z = 100;      // 工位门架立柱离轨道中线的距离
  const POST_W = 9;        // 立柱的截面尺寸
  const BEAM_H = 11;       // 门架横梁高度
  // 横梁要架在轨道**上方**：跟轨道同高的话，主轨会被埋进横梁里，
  // "穿门而过"这个动作就看不见了。
  const BEAM_Y = RAIL_Y + 40;
  const POST_TOP = BEAM_Y + BEAM_H;
  const PAD_Z = 74;        // 工位底板在泳道外缘再外扩一点
  const BARRIER_GAP = 46;  // 闸门落下时轨道断开的长度
  const LIGHT = (function () {
    const v = [-0.42, 0.86, 0.30];
    const n = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / n, v[1] / n, v[2] / n];
  })();

  const LAYER_FALLBACK = { raw: "#3f8f8a", stg: "#3f6fa8", mart: "#7a6fc4" };

  // 默认机位。初始视图和「重置视角」共用同一份，免得两处各写一个数字、
  // 改了一处忘了另一处。
  const DEFAULT_YAW = -0.60;   // 绕 Y 轴 -34°，斜着看才有纵深
  const DEFAULT_PITCH = 0.50;  // 俯角 29°。实测取景是「宽度」先顶到预算的，
                               // 改俯角不改变缩放，所以纯按观感定：
                               // 俯角大一点能看到底板和投影，"站在地上"更足。

  // ---------- 状态 ----------

  const canvasRef = { el: null };
  const ctxRef = { el: null };

  const view = {
    yaw: DEFAULT_YAW,
    pitch: DEFAULT_PITCH,
    dist: 2600,
    fitDist: 2600,
    target: [0, 0, 0],
    focal: 2400,
  };

  const scene = {
    graph: null,
    nodes: [],        // 布局后的表方块（带 x/y/z）
    byId: {},
    edges: [],
    stations: [],     // 布局后的工位（带 x）
    stationByKey: {},
    crates: [],       // 没有表的工位上的「产物箱」
    laneLabels: [],
    flow: null,
    process: { stage: null, status: null, since: 0 },
    size: null,
    theme: null,
    hover: null,      // "table id" 或 "station:key"
    selected: null,
    filter: "all",
    autoRotate: false,
    visible: false,
    drag: null,
    raf: 0,
    lastTs: 0,
    pulse: 0,
    onSelect: null,
    needFit: true,
    error: null,
    fitInfo: null,
  };

  // ---------- 主题 ----------

  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const pick = (name, fallback) => {
      const v = cs.getPropertyValue(name);
      return (v && v.trim()) || fallback;
    };
    const bgTop = parseColor(pick("--scene-sky-1", "#20303c")) || [32, 48, 60];
    const bgBot = parseColor(pick("--scene-sky-2", "#101418")) || [16, 20, 24];
    scene.theme = {
      bgTop: bgTop,
      bgBot: bgBot,
      floor: parseColor(pick("--scene-floor", "#1a2027")) || [26, 32, 39],
      grid: parseColor(pick("--scene-grid", "#2d3844")) || [45, 56, 68],
      shadow: pick("--scene-shadow", "rgba(0,0,0,.24)"),
      labelBg: pick("--scene-label-bg", "rgba(20,26,32,.78)"),
      text: pick("--text", "#e9e9e4"),
      text2: parseColor(pick("--text-2", "#a5a59b")) || [165, 165, 155],
      text3: parseColor(pick("--text-3", "#7c7c73")) || [124, 124, 115],
      accent: parseColor(pick("--accent", "#6aa6dc")) || [106, 166, 220],
      ok: parseColor(pick("--ok", "#6fbb8b")) || [111, 187, 139],
      warn: parseColor(pick("--warn", "#d9a545")) || [217, 165, 69],
      block: parseColor(pick("--block", "#e08573")) || [224, 133, 115],
      rail: parseColor(pick("--scene-rail", "#3a4652")) || [58, 70, 82],
      layers: {
        raw: parseColor(pick("--scene-raw", LAYER_FALLBACK.raw)) || [63, 143, 138],
        stg: parseColor(pick("--scene-stg", LAYER_FALLBACK.stg)) || [63, 111, 168],
        mart: parseColor(pick("--scene-mart", LAYER_FALLBACK.mart)) || [122, 111, 196],
      },
    };
  }

  // 工位在渲染时的状态 = 磁盘事实 + 外部推进来的「运行中」。
  // 为什么不直接改 scene.stations[i].status：那是从库和文件扫出来的事实，
  // 一个工位跑起来之前可能就已经是「完成」了（重跑一次）。两者混在一个字段里，
  // 会出现「既完成又运行中」的假象，而且任务结束后没法还原。
  // 所以运行态单独放在 scene.process 里，渲染时叠一层。
  function stationStatus(st) {
    const p = scene.process || {};
    if (p.status === "running" && p.stage === st.key) return "running";
    return st.status;
  }

  // 工位状态 → 颜色。pending 用灰，让人一眼看出"这段还没走"。
  function statusColor(status) {
    const th = scene.theme;
    if (status === "blocked") return th.block;
    if (status === "warn") return th.warn;
    if (status === "running") return th.accent;
    if (status === "ok") return th.ok;
    return th.text3;
  }

  // ---------- 投影 ----------

  function project(p) {
    const x = p[0] - view.target[0];
    const y = p[1] - view.target[1];
    const z = p[2] - view.target[2];

    const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw);
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;

    const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
    const y1 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;

    const zc = z2 + view.dist;
    if (zc < 8) return null;
    const k = view.focal / zc;
    const size = scene.size || { w: 1, h: 1 };
    return { x: size.w / 2 + x1 * k, y: size.h / 2 - y1 * k, z: zc, k: k };
  }

  function projectAll(points) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const p = project(points[i]);
      if (!p) return null;
      out.push(p);
    }
    return out;
  }

  // ---------- 布局 ----------

  function stationCount() {
    const g = scene.graph;
    return Math.max(1, ((g && g.stations) || []).length);
  }

  function railX0() {
    const n = stationCount();
    return -((n - 1) / 2) * STATION_GAP - RAIL_OVER;
  }

  function railX1() {
    const n = stationCount();
    return ((n - 1) / 2) * STATION_GAP + RAIL_OVER;
  }

  // 流程「走到」的 X 坐标：前沿那个工位的位置。
  // 全部走完时就是轨道终点。
  function litToX() {
    const sts = scene.stations || [];
    const fl = scene.flow || (scene.graph && scene.graph.flow);
    if (!sts.length) return 0;
    const f = fl ? Math.min(fl.frontier, sts.length) : sts.length;
    if (f >= sts.length) return railX1();
    return sts[f].x;
  }

  function buildLayout() {
    const g = scene.graph;
    if (!g) return;

    const stations = (g.stations || []).slice().sort((a, b) => a.order - b.order);
    const n = Math.max(1, stations.length);
    const lanes = g.groups || [];
    const rowOf = {};
    lanes.forEach((d, i) => { rowOf[d.key] = i; });

    scene.stations = stations.map(function (s) {
      return Object.assign({}, s, { x: (s.order - (n - 1) / 2) * STATION_GAP });
    });
    scene.stationByKey = {};
    scene.stations.forEach((s) => { scene.stationByKey[s.key] = s; });
    scene.flow = g.flow || null;

    // 方块：先按 (工位, 泳道) 分格，格内再摆成小网格。
    // 财务那一格里有 4 张 mart，不分开摆会精确重叠，看起来像只有一张表。
    const cells = {};
    g.nodes.forEach(function (nd) {
      const key = (nd.station || "-") + "|" + nd.group;
      (cells[key] = cells[key] || []).push(nd);
    });

    const maxRows = Math.max(1, ...g.nodes.map((x) => x.rows || 0));
    const logMax = Math.log1p(maxRows);

    Object.keys(cells).forEach(function (key) {
      const list = cells[key];
      const st = scene.stationByKey[list[0].station];
      const x0 = st ? st.x : 0;
      const lane = rowOf[list[0].group] != null ? rowOf[list[0].group] : 0;
      const cols = list.length <= 2 ? list.length : 2;
      const rows = Math.ceil(list.length / Math.max(1, cols));

      list.forEach(function (nd, i) {
        const gx = i % cols, gy = Math.floor(i / cols);
        const ox = (gx - (cols - 1) / 2) * SUB_GAP;
        const oz = (gy - (rows - 1) / 2) * SUB_GAP;
        nd.h = MIN_H + (MAX_H - MIN_H) *
          (Math.log1p(nd.rows || 0) / (logMax || 1));
        nd.pos = [x0 + ox, FLOOR_Y,
                  (lane - (lanes.length - 1) / 2) * LANE_GAP + oz];
        nd.center = [nd.pos[0], FLOOR_Y + nd.h / 2, nd.pos[2]];
        nd.top = [nd.pos[0], FLOOR_Y + nd.h, nd.pos[2]];
      });
    });

    scene.nodes = g.nodes.slice();
    scene.byId = {};
    scene.nodes.forEach((x) => { scene.byId[x.id] = x; });
    scene.edges = (g.edges || []).filter(
      (e) => scene.byId[e.from] && scene.byId[e.to]);

    // 产物箱：这一步不产出表的工位（生成数据/落湖/校验/签字/交付）也得看得见产出。
    // 有表的工位不放箱子 —— 那些方块本身就是它的产出，多放一个是重复信息。
    const maxCount = Math.max(1, ...stations.map((s) => s.count || 0));
    const logMaxC = Math.log1p(maxCount);
    scene.crates = [];
    scene.stations.forEach(function (st) {
      if ((st.tables || []).length) return;
      if (!(st.count > 0)) return;
      const h = MIN_H + (MAX_H - MIN_H) * (Math.log1p(st.count) / (logMaxC || 1));
      const c = {
        id: "station:" + st.key,
        kind: "crate",
        station: st.key,
        rows: st.count,
        label: st.count + " " + (st.unit || ""),
        status: st.status,
        pos: [st.x, FLOOR_Y, 0],
        h: h,
      };
      c.center = [c.pos[0], FLOOR_Y + h / 2, c.pos[2]];
      c.top = [c.pos[0], FLOOR_Y + h, c.pos[2]];
      scene.crates.push(c);
    });

    // 泳道标签贴在场景最左侧，用 2 个字（经营/渠道/财务/客源/其他）。
    // 留白只够放这几个字 —— 早先这里用的是 `PAD_Z + laneExtent`（462 世界单位），
    // 那是把 Z 方向的泳道宽度错当成了 X 方向要留的宽度：Z 再宽也不会在左侧占地方。
    // 实测这多让出约 390 单位，取景被迫退远，方块只占画布宽度的 54%。
    // 现在只按「越过最左边那块底板一点点」来留。
    const leftEdge = -((n - 1) / 2) * STATION_GAP - Math.max(PAD_Z + 60, 150);
    scene.laneLabels = lanes.map(function (d, i) {
      return {
        text: d.label,
        p: [leftEdge - 66, FLOOR_Y + 6, (i - (lanes.length - 1) / 2) * LANE_GAP],
      };
    });
    scene.laneLabelX = leftEdge - 66;

    scene.bounds = computeBounds();
    scene.needFit = true;
  }

  function padHalfZ(st) {
    const lanes = (scene.graph && scene.graph.groups) || [];
    if ((st.tables || []).length && lanes.length) {
      return ((lanes.length - 1) / 2) * LANE_GAP + PAD_Z;
    }
    return POST_Z + 46;
  }

  function computeBounds() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    const push = function (x, y, z) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    };
    scene.nodes.concat(scene.crates).forEach(function (bd) {
      push(bd.pos[0] - BOX_W / 2, bd.pos[1], bd.pos[2] - BOX_D / 2);
      push(bd.pos[0] + BOX_W / 2, bd.pos[1] + bd.h, bd.pos[2] + BOX_D / 2);
    });
    scene.stations.forEach(function (st) {
      const ph = padHalfZ(st);
      push(st.x - STATION_GAP * 0.44, POST_TOP + 96, -ph);
      push(st.x + STATION_GAP * 0.44, FLOOR_Y, ph);
    });
    push(railX0() - 20, RAIL_Y + 20, -RAIL_HALF);
    push(railX1() + 20, RAIL_Y - 20, RAIL_HALF);
    push(scene.laneLabelX - 70, FLOOR_Y + 6, 0);
    return { minX, maxX, minY, maxY, minZ, maxZ };
  }

  // 取景要用的「真实内容点」。
  // 为什么不用包围盒的 8 个角：那个盒子是把「域标预留宽度」当成一条延伸到
  // Z 两端的矩形来算的，它的角点落在一片根本没有东西画的空白里。拿虚构的
  // 角点去反解距离，等于让一片空白来决定整幅全景的缩放 —— 实测这会让视口
  // 左侧白白多出约 300px 空带，整幅图被迫缩小三成。所以只收真实画得出的点。
  function collectFitPoints() {
    const pts = [];
    const add = function (p, pad) { pts.push({ p: p, pad: pad || [0, 0, 0, 0] }); };

    // 方块与产物箱的 8 个角
    scene.nodes.concat(scene.crates).forEach(function (bd) {
      solidFaces(bd, BOX_W, BOX_D).forEach(function (f) {
        f.pts.forEach((p) => add(p));
      });
    });

    scene.stations.forEach(function (st) {
      const ph = padHalfZ(st);
      const hx = STATION_GAP * 0.44;
      // 底板四角
      [[st.x - hx, ph], [st.x + hx, ph], [st.x + hx, -ph], [st.x - hx, -ph]]
        .forEach((c) => add([c[0], FLOOR_Y, c[1]]));
      // 门架立柱的上下端点
      [POST_Z, -POST_Z].forEach(function (z) {
        add([st.x, FLOOR_Y, z]);
        add([st.x, POST_TOP, z]);
      });
      // 工位标题：画在门架上方，两行字 → 按屏幕像素留白
      const w = Math.max(72, ((st.label || "").length + 2) * 14);
      add([st.x, POST_TOP + 40, 0], [w / 2 + 8, w / 2 + 8, 30, 34]);
    });

    // 主轨的两端
    add([railX0() - 10, RAIL_Y, -RAIL_HALF]);
    add([railX0() - 10, RAIL_Y, RAIL_HALF]);
    add([railX1() + 10, RAIL_Y, -RAIL_HALF]);
    add([railX1() + 10, RAIL_Y, RAIL_HALF]);

    // 泳道标签
    scene.laneLabels.forEach(function (l) {
      add(l.p, [50, 10, 12, 12]);
    });
    return pts;
  }

  function fitView() {
    const size = scene.size;
    if (!size) return;
    const pts = collectFitPoints();
    if (!pts.length) return;

    const ctx = ctxRef.el;
    if (ctx) {
      ctx.save();
      ctx.font = "500 11.5px " + FONT;
      scene.laneLabels.forEach(function (l) { l.txtW = ctx.measureText(l.text).width; });
      ctx.restore();
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    pts.forEach(function (o) {
      const p = o.p;
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
      minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
    });
    view.target = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];

    const halfW = (size.w / 2) * 0.94;
    const halfH = (size.h / 2) * 0.90;

    // 距离越大投影越小，是单调的 —— 那就不用解方程，直接二分。
    // 逐个点判定「带留白后是否还在视口内」，比任何解析式都直白。
    function fits(dist) {
      const saved = view.dist;
      view.dist = dist;
      let ok = true;
      for (let i = 0; i < pts.length; i++) {
        const q = project(pts[i].p);
        if (!q) { ok = false; break; }
        const pd = pts[i].pad;
        if (q.x - pd[0] < size.w / 2 - halfW || q.x + pd[1] > size.w / 2 + halfW ||
            q.y - pd[2] < size.h / 2 - halfH || q.y + pd[3] > size.h / 2 + halfH) {
          ok = false;
          break;
        }
      }
      view.dist = saved;
      return ok;
    }

    function solveDist() {
      let lo = 20, hi = 40000, guard = 0;
      while (!fits(hi) && guard++ < 32) hi *= 1.6;
      for (let i = 0; i < 44; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) hi = mid; else lo = mid;
      }
      return hi;
    }

    view.dist = solveDist();

    // 居中校正。target 取的是世界包围盒中心，但投影后的包围盒中心并不重合
    // （泳道标签在左、主轨伸头在右，两侧留白不对称）。校正量按「世界单位/像素」
    // 换算，跟拖拽平移用的是同一套换算，手感一致。两轮就收敛了。
    for (let round = 0; round < 3; round++) {
      let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
      pts.forEach(function (o) {
        const q = project(o.p);
        if (!q) return;
        sx0 = Math.min(sx0, q.x - o.pad[0]); sx1 = Math.max(sx1, q.x + o.pad[1]);
        sy0 = Math.min(sy0, q.y - o.pad[2]); sy1 = Math.max(sy1, q.y + o.pad[3]);
      });
      const offx = (sx0 + sx1) / 2 - size.w / 2;
      const offy = (sy0 + sy1) / 2 - size.h / 2;
      if (!isFinite(offx) || !isFinite(offy)) break;
      if (Math.abs(offx) < 1.5 && Math.abs(offy) < 1.5) break;
      const w2p = view.dist / view.focal;   // 世界单位 / 像素
      const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw);
      view.target = [
        view.target[0] + offx * w2p * cy,
        view.target[1] - offy * w2p,
        view.target[2] - offx * w2p * sy,
      ];
      view.dist = solveDist();
    }

    view.dist *= 1.006;
    view.fitDist = view.dist;
    scene.needFit = false;

    // 把「最终占了多少屏、是哪一轴先顶到预算」记下来。
    // 调参时最耗时间的就是猜这个 —— 纵向和横向的解法完全相反。
    let cx0 = Infinity, cx1 = -Infinity, cy0 = Infinity, cy1 = -Infinity;
    pts.forEach(function (o) {
      const q = project(o.p);
      if (!q) return;
      cx0 = Math.min(cx0, q.x - o.pad[0]); cx1 = Math.max(cx1, q.x + o.pad[1]);
      cy0 = Math.min(cy0, q.y - o.pad[2]); cy1 = Math.max(cy1, q.y + o.pad[3]);
    });
    const useW = (cx1 - cx0) / (halfW * 2);
    const useH = (cy1 - cy0) / (halfH * 2);
    scene.fitInfo = {
      content: [Math.round(cx0), Math.round(cy0), Math.round(cx1), Math.round(cy1)],
      useW: +useW.toFixed(3),
      useH: +useH.toFixed(3),
      bind: useW >= useH ? "宽" : "高",
      k: +(view.focal / view.dist).toFixed(4),
    };
  }

  function setSize() {
    const el = canvasRef.el;
    if (!el) return;
    const parent = el.parentElement;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);

    // 面板 display:none 时 clientWidth/Height 量出来是 0。绝不能把这个 0
    // 当成真实尺寸：焦距是按短边算的，一旦记下 1×1 再切回可见，焦距会从
    // 2.6 跳到 2000 上下，而 dist 还是按 1×1 适配出来的 —— 场景会直接爆出视口。
    // 所以隐藏态的测量一律丢弃，保留上一次真实尺寸。
    if (w < 40 || h < 40) return;

    const prev = scene.size;
    const dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    scene.size = { w: w, h: h, dpr: dpr };
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    el.style.width = w + "px";
    el.style.height = h + "px";
    // 焦距 = 视口短边 × 4.2 → 垂直视场角约 13.6°，接近等轴测的长焦。
    // 为什么不用 0.9（=58° 广角）：广角下近端角落的投影会被放大，适配算法为了
    // 把它塞进视口只能把整机拉远。实测 58° 时平均缩放只有理论最大值的 6 成；
    // 长焦把远近端的尺寸差压平后能到 8 成。透视纵深靠俯角 + 投影来表达。
    view.focal = Math.min(w, h) * 4.2;
    const ctx = ctxRef.el;
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 尺寸真的变了（含第一次拿到真实尺寸）才重新适配取景；
    // 只是切了个 Tab、量出来的尺寸没变，就保留用户自己转/缩的角度。
    if (!prev || prev.w !== w || prev.h !== h) scene.needFit = true;
  }

  // ---------- 实体几何（所有长方体共用一套，保证光照一致） ----------

  function solidFaces(bd, w, d) {
    const hw = w / 2, hd = d / 2;
    const x = bd.pos[0], y0 = bd.pos[1], z = bd.pos[2];
    const y1 = y0 + bd.h;
    const P = [
      [x - hw, y0, z - hd], [x + hw, y0, z - hd],
      [x + hw, y0, z + hd], [x - hw, y0, z + hd],
      [x - hw, y1, z - hd], [x + hw, y1, z - hd],
      [x + hw, y1, z + hd], [x - hw, y1, z + hd],
    ];
    return [
      { pts: [P[4], P[5], P[6], P[7]], n: [0, 1, 0] },    // 顶
      { pts: [P[0], P[1], P[5], P[4]], n: [0, 0, -1] },   // 后
      { pts: [P[1], P[2], P[6], P[5]], n: [1, 0, 0] },    // 右
      { pts: [P[2], P[3], P[7], P[6]], n: [0, 0, 1] },    // 前
      { pts: [P[3], P[0], P[4], P[7]], n: [-1, 0, 0] },   // 左
    ];
  }

  function faceLuma(normal) {
    const d = normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2];
    return 0.42 + 0.58 * Math.max(0, d);
  }

  // 画一个长方体：按面深度排序后逐面填充。alpha=1 时是实心的，用于结构件。
  function drawSolid(ctx, bd, w, d, col, alpha, outline) {
    const faces = solidFaces(bd, w, d).map(function (f) {
      const proj = projectAll(f.pts);
      if (!proj) return null;
      let z = 0;
      proj.forEach((p) => { z += p.z; });
      return { proj: proj, z: z / proj.length, n: f.n };
    }).filter(Boolean);
    faces.sort((a, b) => b.z - a.z);

    faces.forEach(function (f) {
      ctx.beginPath();
      ctx.moveTo(f.proj[0].x, f.proj[0].y);
      for (let i = 1; i < f.proj.length; i++) ctx.lineTo(f.proj[i].x, f.proj[i].y);
      ctx.closePath();
      ctx.fillStyle = rgba(shade(col, faceLuma(f.n) - 0.62), alpha);
      ctx.fill();
    });
    if (outline) {
      const top = faces.find((f) => f.n[1] === 1);
      if (top) {
        ctx.beginPath();
        ctx.moveTo(top.proj[0].x, top.proj[0].y);
        for (let i = 1; i < top.proj.length; i++) ctx.lineTo(top.proj[i].x, top.proj[i].y);
        ctx.closePath();
        ctx.strokeStyle = rgba(col, typeof outline === "number" ? outline : 0.8);
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    }
  }

  // ---------- 视觉状态 ----------

  function nodeColor(n) {
    const th = scene.theme;
    if (n.status === "block") return th.block;
    if (n.status === "warn") return th.warn;
    // 「无规则覆盖」只体现在虚线轮廓上，不改颜色。
    // 理由：19 张表里有 13 张没有被规则直接点名，如果让它们整体变灰，
    // 整个场景就会一片灰 —— 一个次要事实压过了「三层结构」这个主要信息。
    return th.layers[n.layer] || th.accent;
  }

  function dimOf(n) {
    // 「只看异常」= 只留非通过项。判据是 status === "ok" 而不是 != block/warn：
    // 实测这份数据 block=0、warn=0，如果只认这两种，点下去 19 张表全被压到 0.12，
    // 整个场景变成一片空白 —— 一个什么都没排除掉的过滤器比没有过滤器更糟。
    if (scene.filter === "problem" && n.status === "ok") return 0.12;
    if (scene.hover && scene.hover !== n.id && !isNeighbour(n.id, scene.hover)) return 0.55;
    if (scene.selected && scene.selected !== n.id && !isNeighbour(n.id, scene.selected)) return 0.45;
    return 1;
  }

  function isNeighbour(a, b) {
    if (a === b) return true;
    for (let i = 0; i < scene.edges.length; i++) {
      const e = scene.edges[i];
      if ((e.from === a && e.to === b) || (e.from === b && e.to === a)) return true;
    }
    return false;
  }

  // ---------- 渲染 ----------

  function render() {
    const ctx = ctxRef.el;
    const size = scene.size;
    const th = scene.theme;
    if (!ctx || !size || !th) return;

    if (scene.needFit) fitView();

    const grad = ctx.createLinearGradient(0, 0, 0, size.h);
    grad.addColorStop(0, rgba(th.bgTop, 1));
    grad.addColorStop(1, rgba(th.bgBot, 1));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size.w, size.h);

    // 地面、底板、投影永远在最下面
    drawFloor(ctx);
    drawShadows(ctx);

    // 其余所有三维结构进同一个列表，按深度远→近排序。
    // 为什么必须排序：主轨悬在方块上方，站台立柱又穿过方块列，
    // 固定顺序画一定会出现「轨道穿过方块」这种错误遮挡。
    const list = [];
    const pushSolid = function (bd, w, d, col, alpha, outline) {
      const p = project(bd.center || [bd.pos[0], bd.pos[1] + bd.h / 2, bd.pos[2]]);
      if (!p) return;
      list.push({ z: p.z, draw: () => drawSolid(ctx, bd, w, d, col, alpha, outline) });
    };

    // 工位门架：立柱 + 横梁。
    // 注意 solidFaces 把 pos 当成**底面的中心**（x、z 都是中心，y 是底），
    // 所以这里给的是中心点，不是角点 —— 一开始按角点写，门架整体歪了半个截面。
    scene.stations.forEach(function (st) {
      const dim = stationDim(st);
      const col = statusColor(stationStatus(st));
      [POST_Z, -POST_Z].forEach(function (z) {
        const post = { pos: [st.x, FLOOR_Y, z], h: POST_TOP - FLOOR_Y };
        pushSolid(post, POST_W, POST_W, col, 0.5 + 0.45 * dim);
      });
      const beam = { pos: [st.x, BEAM_Y, 0], h: BEAM_H };
      pushSolid(beam, POST_W, POST_Z * 2, col, 0.42 + 0.45 * dim);
    });

    // 主轨：按工位间隙分段，才能和方块一起排序
    railSegments().forEach(function (seg) {
      const mid = [(seg.x0 + seg.x1) / 2, RAIL_Y, 0];
      const p = project(mid);
      if (!p) return;
      list.push({ z: p.z, draw: () => drawRailSegment(ctx, seg) });
    });

    // 闸门拦杆
    const gate = gateStation();
    if (gate) {
      const g = gateGeometry(gate);
      const p = project([gate.x, RAIL_Y, 0]);
      if (p) list.push({ z: p.z, draw: () => drawGate(ctx, g) });
    }

    // 所有方块与产物箱
    scene.nodes.concat(scene.crates).forEach(function (bd) {
      const p = project(bd.center);
      if (!p) return;
      list.push({ z: p.z, draw: () => drawBody(ctx, bd) });
    });

    list.sort((a, b) => b.z - a.z);
    list.forEach((it) => it.draw());

    // 血缘弧
    drawEdges(ctx);

    // 文字最后画：三维结构挡不住标签，标签永远可读
    drawStationLabels(ctx);
    const bodies = scene.nodes.concat(scene.crates)
      .slice().sort(function (a, b) {
        const pa = project(a.center), pb = project(b.center);
        return (pb ? pb.z : 0) - (pa ? pa.z : 0);
      });
    bodies.reverse().forEach((bd) => drawBodyLabel(ctx, bd));
    drawLaneLabels(ctx);

    // 流动颗粒画在最后：它们在路上跑，不该被路面自己压掉
    drawFlow(ctx);
    drawHoverRing(ctx);
  }

  function stationDim(st) {
    if (scene.filter === "problem" && st.status === "ok") return 0.2;
    return 1;
  }

  function drawFloor(ctx) {
    const th = scene.theme;
    const b = scene.bounds;
    if (!b) return;
    const z0 = b.minZ, z1 = b.maxZ;

    // 工位底板：让每一步有"占地"，不然门架像浮在地面上
    scene.stations.forEach(function (st) {
      const dim = stationDim(st);
      const ph = padHalfZ(st);
      const hx = STATION_GAP * 0.44;
      const quad = projectAll([
        [st.x - hx, FLOOR_Y, -ph], [st.x + hx, FLOOR_Y, -ph],
        [st.x + hx, FLOOR_Y, ph], [st.x - hx, FLOOR_Y, ph],
      ]);
      if (!quad) return;
      const col = statusColor(stationStatus(st));
      ctx.beginPath();
      ctx.moveTo(quad[0].x, quad[0].y);
      for (let i = 1; i < quad.length; i++) ctx.lineTo(quad[i].x, quad[i].y);
      ctx.closePath();
      ctx.fillStyle = rgba(col, 0.05 + 0.06 * dim);
      ctx.fill();
      ctx.strokeStyle = rgba(col, (0.22 + 0.3 * dim));
      ctx.lineWidth = 1;
      ctx.stroke();

      // 底板上的格线，暗示"这里能停东西"
      ctx.strokeStyle = rgba(th.grid, 0.4 * dim);
      ctx.lineWidth = 0.6;
      for (let z = -ph + 56; z < ph; z += 78) {
        const a = project([st.x - hx, FLOOR_Y, z]);
        const c = project([st.x + hx, FLOOR_Y, z]);
        if (!a || !c) continue;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
      }
    });

    // 泳道底纹：沿 Z 的五条淡色长带，把业务域"铺"在地面上
    const lanes = (scene.graph && scene.graph.groups) || [];
    lanes.forEach(function (d, i) {
      const z = (i - (lanes.length - 1) / 2) * LANE_GAP;
      const quad = projectAll([
        [railX0(), FLOOR_Y, z - LANE_GAP / 2],
        [railX1(), FLOOR_Y, z - LANE_GAP / 2],
        [railX1(), FLOOR_Y, z + LANE_GAP / 2],
        [railX0(), FLOOR_Y, z + LANE_GAP / 2],
      ]);
      if (!quad) return;
      ctx.beginPath();
      ctx.moveTo(quad[0].x, quad[0].y);
      for (let i2 = 1; i2 < quad.length; i2++) ctx.lineTo(quad[i2].x, quad[i2].y);
      ctx.closePath();
      ctx.fillStyle = rgba(th.floor, i % 2 ? 0.34 : 0.16);
      ctx.fill();
    });

    // 地面外框
    const frame = projectAll([
      [railX0(), FLOOR_Y, z0], [railX1(), FLOOR_Y, z0],
      [railX1(), FLOOR_Y, z1], [railX0(), FLOOR_Y, z1],
    ]);
    if (frame) {
      ctx.beginPath();
      ctx.moveTo(frame[0].x, frame[0].y);
      for (let i = 1; i < frame.length; i++) ctx.lineTo(frame[i].x, frame[i].y);
      ctx.closePath();
      ctx.strokeStyle = rgba(th.grid, 0.55);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawShadows(ctx) {
    // 地面投影。没有它方块是「飘」的 —— 这一点点阴影是伪 3D 里
    // 让人读出「它站在地上」的关键，比任何描边都有效。
    const steps = 14;
    scene.nodes.concat(scene.crates).forEach(function (n) {
      const y = FLOOR_Y + 1.5;
      const rx = BOX_W * 0.78, rz = BOX_D * 0.78;
      const pts = [];
      for (let i = 0; i < steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        pts.push([n.pos[0] + Math.cos(t) * rx, y, n.pos[2] + Math.sin(t) * rz]);
      }
      const proj = projectAll(pts);
      if (!proj) return;
      ctx.beginPath();
      ctx.moveTo(proj[0].x, proj[0].y);
      for (let i = 1; i < proj.length; i++) ctx.lineTo(proj[i].x, proj[i].y);
      ctx.closePath();
      ctx.fillStyle = scene.theme.shadow;
      ctx.fill();
    });
  }

  // ---------- 主轨 ----------

  function railSegments() {
    const sts = scene.stations;
    const segs = [];
    if (!sts.length) return segs;
    const to = litToX();
    const g = gateStation();
    const gg = g ? gateGeometry(g) : null;
    // 闸门落下时轨道要真的断开。注意闸门的 X 正好是某一分段的**端点**，
    // 所以判断不能写「严格跨过」（x0 < gx < x1）—— 那样一段都不会命中，
    // 杆画了、轨道照旧连着，看起来像摆设。要按"到达/离开闸门"来切。
    const cut = (gg && gg.locked) ? gg.x : null;

    const raw = [[railX0(), sts[0].x]];
    for (let i = 0; i < sts.length - 1; i++) raw.push([sts[i].x, sts[i + 1].x]);
    raw.push([sts[sts.length - 1].x, railX1()]);

    raw.forEach(function (pr, idx) {
      let x0 = pr[0], x1 = pr[1];
      if (cut != null && x0 < cut && x1 >= cut) x1 = cut - BARRIER_GAP / 2;
      if (cut != null && x0 <= cut && x1 > cut) x0 = cut + BARRIER_GAP / 2;
      if (x1 - x0 < 1) return;
      segs.push({ x0: x0, x1: x1, index: idx, lit: x0 < to - 1 });
    });
    return segs;
  }

  function drawRailSegment(ctx, seg) {
    const th = scene.theme;
    // 闸门的断开已经在 railSegments() 里切好了（那是唯一知道"全局哪一段被闸门截断"
    // 的地方），这里只管画，不再重复判断一次 —— 两处都判，迟早会不一致。
    const segs = [[seg.x0, seg.x1]];

    segs.forEach(function (pr) {
      const quad = projectAll([
        [pr[0], RAIL_Y, -RAIL_HALF], [pr[1], RAIL_Y, -RAIL_HALF],
        [pr[1], RAIL_Y, RAIL_HALF], [pr[0], RAIL_Y, RAIL_HALF],
      ]);
      if (!quad) return;
      ctx.beginPath();
      ctx.moveTo(quad[0].x, quad[0].y);
      for (let i = 1; i < quad.length; i++) ctx.lineTo(quad[i].x, quad[i].y);
      ctx.closePath();
      ctx.fillStyle = rgba(th.rail, 0.92);
      ctx.fill();
      ctx.strokeStyle = rgba(shade(th.rail, -0.35), 0.9);
      ctx.lineWidth = 1;
      ctx.stroke();

      // 中线：走完的一段实线发亮，没走到的虚线
      const mid = projectAll([
        [pr[0], RAIL_Y + 1, 0], [pr[1], RAIL_Y + 1, 0],
      ]);
      if (!mid) return;
      ctx.beginPath();
      ctx.moveTo(mid[0].x, mid[0].y);
      ctx.lineTo(mid[1].x, mid[1].y);
      if (seg.lit) {
        ctx.strokeStyle = rgba(th.ok, 0.85);
        ctx.lineWidth = 2.4;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = rgba(th.text3, 0.55);
        ctx.lineWidth = 1.2;
        ctx.setLineDash([7, 6]);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // 走完的段再加一条发光边，让"通电"的感觉出来
      if (seg.lit) {
        [[-RAIL_HALF, 0], [RAIL_HALF, 0]].forEach(function (e) {
          const edge = projectAll([
            [pr[0], RAIL_Y + 1, e[0]], [pr[1], RAIL_Y + 1, e[0]],
          ]);
          if (!edge) return;
          ctx.beginPath();
          ctx.moveTo(edge[0].x, edge[0].y);
          ctx.lineTo(edge[1].x, edge[1].y);
          ctx.strokeStyle = rgba(th.ok, 0.4);
          ctx.lineWidth = 1.4;
          ctx.stroke();
        });
      }
    });
  }

  // ---------- 闸门 ----------

  function gateStation() {
    return (scene.stations || []).find((s) => s.gate) || null;
  }

  function gateGeometry(st) {
    const fl = scene.flow || {};
    const locked = fl.gate_locked !== false && st.status !== "ok";
    return {
      x: st.x, status: st.status, locked: locked,
      approved: fl.approval === "approved", reviewer: fl.reviewer || "",
    };
  }

  function drawGate(ctx, g) {
    const th = scene.theme;
    const col = g.locked ? (g.status === "blocked" ? th.block : th.warn) : th.ok;
    // 落下时杆压在轨道面上（挡住去路），放行时抬到门柱上方 —— 位置本身就是状态
    const barY = g.locked ? RAIL_Y - 5 : RAIL_Y + 74;
    const hz = RAIL_HALF + 16;

    // 两根门柱
    [-1, 1].forEach(function (sgn) {
      const post = { pos: [g.x, RAIL_Y - 60, sgn * hz], h: 160 };
      drawSolid(ctx, post, 14, 14, col, 0.9, 0.9);
    });

    // 拦杆（z 以中心给，实体的 z 是中心不是端点）
    const bar = { pos: [g.x, barY, 0], h: 11 };
    drawSolid(ctx, bar, 13, hz * 2, col, 0.95, 1);

    // 落杆时的警示线：呼吸闪烁，比静态栏杆更"拦得住人"
    if (g.locked) {
      const a = project([g.x, barY + 6, -hz]);
      const b = project([g.x, barY + 6, hz]);
      if (a && b) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = rgba(col, 0.5 + 0.4 * (0.5 + 0.5 * Math.sin(scene.pulse * 3)));
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
  }

  // ---------- 流动颗粒 ----------

  // 颗粒的位置算一次、两处用：画的时候用，debug() 里也用它来自证"画面真的在动"。
  // 只算不暴露的话，验收只能靠"我觉得它在动"，那不算证据。
  function flowParticles() {
    const sts = scene.stations;
    if (!sts.length) return [];
    const x0 = railX0();
    const xEnd = litToX();
    const span = xEnd - x0;
    if (span <= 0) return [];

    const proc = scene.process || {};
    const running = proc.stage && proc.status === "running";
    const gate = gateStation();
    const g = gate ? gateGeometry(gate) : null;
    const blockedAt = g && g.locked ? g.x : null;
    // 正在跑的时候整体提速：静止的噪点看不出"在动"，提速后一眼就是活的
    const speed = running ? 0.34 : 0.16;
    const COUNT = Math.max(18, Math.round(span / 92));
    const lanes = [-13, 0, 13];
    const runSt = proc.stage && scene.stationByKey[proc.stage];
    const runX = runSt ? runSt.x : null;

    const out = [];
    for (let i = 0; i < COUNT; i++) {
      const t = ((scene.pulse * speed) + i / COUNT) % 1;
      const x = x0 + t * span;
      // 闸门落下时颗粒在门前堆积：越过门的一律压回门前，一排排码住
      const xx = blockedAt != null ? Math.min(x, blockedAt - 14 - (i % 5) * 7) : x;
      out.push({
        i: i, x: xx, z: lanes[i % lanes.length],
        near: !!(running && runX != null && Math.abs(xx - runX) < STATION_GAP),
      });
    }
    return out;
  }

  function drawFlow(ctx) {
    const th = scene.theme;
    if (!scene.stations.length) return;

    flowParticles().forEach(function (pt) {
      const q = project([pt.x, RAIL_Y + 3, pt.z]);
      if (!q) return;
      const r = (pt.near ? 3.4 : 2.5) * Math.max(0.5, Math.min(1.6, q.k / 0.7));
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(th.accent, pt.near ? 0.95 : 0.72);
      ctx.fill();

      // 一点拖尾，让"在动"这件事在静止截图里也看得出来
      const tail = project([pt.x - 26, RAIL_Y + 3, pt.z]);
      if (tail) {
        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y);
        ctx.lineTo(q.x, q.y);
        ctx.strokeStyle = rgba(th.accent, pt.near ? 0.45 : 0.22);
        ctx.lineWidth = pt.near ? 2.4 : 1.6;
        ctx.stroke();
      }
    });

    // 前沿光点：走完的部分跟没走的部分之间那一个亮点。
    // 它比「完成 5/8」这种比例更有用 —— 比例只说还剩多少，它说卡在哪。
    const xEnd = litToX();
    const fq = project([xEnd, RAIL_Y + 4, 0]);
    if (fq) {
      const breathe = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(scene.pulse * 2.2));
      const fl = scene.flow || {};
      const stuck = fl.frontier != null && fl.frontier < scene.stations.length;
      const col = stuck
        ? (scene.stations[fl.frontier].status === "blocked" ? th.block : th.warn)
        : th.ok;
      ctx.beginPath();
      ctx.arc(fq.x, fq.y, 7 * Math.max(0.6, Math.min(1.5, fq.k / 0.7)), 0, Math.PI * 2);
      ctx.fillStyle = rgba(col, 0.85 * breathe);
      ctx.fill();
      const beamTop = project([xEnd, RAIL_Y + 120, 0]);
      if (beamTop) {
        const grd = ctx.createLinearGradient(fq.x, fq.y, beamTop.x, beamTop.y);
        grd.addColorStop(0, rgba(col, 0.5 * breathe));
        grd.addColorStop(1, rgba(col, 0));
        ctx.beginPath();
        ctx.moveTo(fq.x - 5, fq.y);
        ctx.lineTo(beamTop.x - 2, beamTop.y);
        ctx.lineTo(beamTop.x + 2, beamTop.y);
        ctx.lineTo(fq.x + 5, fq.y);
        ctx.closePath();
        ctx.fillStyle = grd;
        ctx.fill();
      }
    }
  }

  // ---------- 方块 / 产物箱 ----------

  function drawBody(ctx, n) {
    if (n.kind === "crate") return drawCrate(ctx, n);
    return drawBox(ctx, n);
  }

  function drawBox(ctx, n) {
    const col = nodeColor(n);
    const dim = dimOf(n);
    const isSel = scene.selected === n.id;
    const isHov = scene.hover === n.id;
    const alpha = 0.30 + 0.52 * dim;
    drawSolid(ctx, n, BOX_W, BOX_D, col, alpha, false);

    const faces = solidFaces(n, BOX_W, BOX_D).map(function (f) {
      const proj = projectAll(f.pts);
      if (!proj) return null;
      return { proj: proj, n: f.n };
    }).filter(Boolean);

    // 轮廓只画一次（顶面），避免六个面叠出毛边
    const top = faces.find((f) => f.n[1] === 1);
    if (top) {
      ctx.beginPath();
      ctx.moveTo(top.proj[0].x, top.proj[0].y);
      for (let i = 1; i < top.proj.length; i++) ctx.lineTo(top.proj[i].x, top.proj[i].y);
      ctx.closePath();
      ctx.strokeStyle = rgba(col, (isSel || isHov ? 1 : 0.8) * Math.max(dim, 0.4));
      ctx.lineWidth = isSel ? 2 : 1.1;
      if (n.status === "uncovered" && !isSel && !isHov) {
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.stroke();
      }
    }

    // 阻断项：呼吸光环，让人一眼看到「这里出事了」
    if (n.status === "block") {
      const halo = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(scene.pulse * 2.4));
      const c = project(n.top);
      if (c) {
        const r = 16 * c.k / 0.6;
        ctx.beginPath();
        ctx.arc(c.x, c.y - 4, Math.max(6, r), 0, Math.PI * 2);
        ctx.fillStyle = rgba(scene.theme.block, halo);
        ctx.fill();
      }
    }
  }

  function drawCrate(ctx, n) {
    const col = statusColor(n.status);
    const dim = stationDim(scene.stationByKey[n.station] || { status: n.status });
    const isSel = scene.selected === n.id;
    const isHov = scene.hover === n.id;
    drawSolid(ctx, n, BOX_W, BOX_D, col, 0.26 + 0.5 * dim, false);

    const faces = solidFaces(n, BOX_W, BOX_D);
    const top = faces.find((f) => f.n[1] === 1);
    const proj = projectAll(top.pts);
    if (proj) {
      ctx.beginPath();
      ctx.moveTo(proj[0].x, proj[0].y);
      for (let i = 1; i < proj.length; i++) ctx.lineTo(proj[i].x, proj[i].y);
      ctx.closePath();
      ctx.strokeStyle = rgba(col, (isSel || isHov ? 1 : 0.75) * Math.max(dim, 0.4));
      ctx.lineWidth = isSel ? 2 : 1.2;
      ctx.stroke();
      // 顶面四角的小十字，跟"有名字的表"区分开：这是"数出来的产物"
      const c = project(n.top);
      if (c && dim > 0.4) {
        ctx.strokeStyle = rgba(col, 0.6);
        ctx.lineWidth = 1;
        const s = 5 + 3 * Math.min(1.4, c.k / 0.7);
        ctx.beginPath();
        ctx.moveTo(c.x - s, c.y); ctx.lineTo(c.x + s, c.y);
        ctx.moveTo(c.x, c.y - s); ctx.lineTo(c.x, c.y + s);
        ctx.stroke();
      }
    }
  }

  // ---------- 标签 ----------

  function drawBodyLabel(ctx, n) {
    const dim = n.kind === "crate"
      ? stationDim(scene.stationByKey[n.station] || { status: n.status })
      : dimOf(n);
    const p = project(n.top);
    if (!p) return;
    const isSel = scene.selected === n.id;
    const isHov = scene.hover === n.id;
    ctx.save();
    ctx.globalAlpha = Math.max(dim, 0.25);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = "500 11.5px " + FONT;
    const label = n.kind === "crate" ? n.label : n.label.replace(/^(raw|stg|mart)_/, "");
    const w = ctx.measureText(label).width + 12;
    const bx = p.x - w / 2;
    const by = p.y - 19;
    roundRect(ctx, bx, by, w, 16, 4);
    ctx.fillStyle = isSel || isHov
      ? rgba(scene.theme.accent, 0.9) : scene.theme.labelBg;
    ctx.fill();
    ctx.fillStyle = isSel || isHov ? "#fff" : scene.theme.text;
    ctx.fillText(label, p.x, p.y - 6);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  const CN_NUM = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

  function drawStationLabels(ctx) {
    const th = scene.theme;
    scene.stations.forEach(function (st) {
      const dim = stationDim(st);
      const p = project([st.x, POST_TOP, 0]);
      if (!p) return;
      const col = statusColor(stationStatus(st));
      const isSel = scene.selected === "station:" + st.key;
      const isHov = scene.hover === "station:" + st.key;

      ctx.save();
      ctx.globalAlpha = Math.max(dim, 0.3);
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";

      // 第一行：序号 + 名称
      const num = CN_NUM[st.order] || ("(" + (st.order + 1) + ")");
      const title = num + " " + st.label;
      ctx.font = "600 13.5px " + FONT;
      const tw = ctx.measureText(title).width;
      // 第二行：产物说明
      ctx.font = "400 11px " + FONT;
      const note = stationStatus(st) === "running"
        ? "运行中 · " + (st.note || "")
        : ((isSel || isHov) ? (st.hint || st.note) : st.note);
      const nw = ctx.measureText(note || "").width;
      const w = Math.max(tw, nw) + 20;
      const bx = p.x - w / 2, by = p.y - 48;
      roundRect(ctx, bx, by, w, 44, 6);
      ctx.fillStyle = isSel || isHov
        ? rgba(th.accent, 0.92) : th.labelBg;
      ctx.fill();
      ctx.strokeStyle = rgba(col, 0.55);
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = (isSel || isHov) ? "#fff" : rgba(col, 0.98);
      ctx.fillText(title, p.x, p.y - 31);
      ctx.font = "400 11px " + FONT;
      ctx.fillStyle = (isSel || isHov) ? "rgba(255,255,255,.9)" : rgba(th.text2, 0.95);
      ctx.fillText(note || "—", p.x, p.y - 14);
      ctx.restore();

      // 状态环：在门架上方套一个圈，running 时转起来
      const ring = project([st.x, POST_TOP + 22, 0]);
      if (ring && (stationStatus(st) === "running" || isSel)) {
        const r = 13 * Math.max(0.6, Math.min(1.6, ring.k / 0.7));
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(col, 0.85);
        ctx.lineWidth = 2.2;
        ctx.setLineDash([9, 7]);
        ctx.lineDashOffset = -scene.pulse * 26;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
      }
    });
  }

  function drawLaneLabels(ctx) {
    const th = scene.theme;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "500 11.5px " + FONT;
    scene.laneLabels.forEach(function (l) {
      const p = project(l.p);
      if (!p) return;
      const short = l.text.length > 3 ? l.text.slice(0, 2) : l.text;
      const q = project([scene.laneLabelX + 26, l.p[1], l.p[2]]);
      ctx.beginPath();
      ctx.moveTo(p.x + 6, p.y);
      if (q) ctx.lineTo(q.x, q.y);
      ctx.strokeStyle = rgba(th.text3, 0.35);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = rgba(th.text3, 0.9);
      ctx.fillText(short, p.x, p.y);
    });
  }

  // ---------- 血缘弧 ----------

  function edgePath(e) {
    const a = scene.byId[e.from], b = scene.byId[e.to];
    if (!a || !b) return null;
    const p0 = a.top;
    const p1 = b.top;
    const span = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
    const lift = 26 + span * 0.22;
    const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 + lift, (p0[2] + p1[2]) / 2];
    const pts = [];
    const STEPS = 16;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS, u = 1 - t;
      pts.push([
        u * u * p0[0] + 2 * u * t * mid[0] + t * t * p1[0],
        u * u * p0[1] + 2 * u * t * mid[1] + t * t * p1[1],
        u * u * p0[2] + 2 * u * t * mid[2] + t * t * p1[2],
      ]);
    }
    return { pts: pts, p0: p0, p1: p1 };
  }

  function drawEdges(ctx) {
    const th = scene.theme;
    const list = [];
    scene.edges.forEach(function (e) {
      const a = scene.byId[e.from], b = scene.byId[e.to];
      if (!a || !b) return;
      const path = edgePath(e);
      const proj = path ? projectAll(path.pts) : null;
      if (!proj) return;
      let z = 0;
      proj.forEach((p) => { z += p.z; });
      list.push({ e: e, proj: proj, z: z / proj.length, path: path });
    });
    list.sort((a, b) => b.z - a.z);

    list.forEach(function (item) {
      const e = item.e;
      const focus = scene.hover || scene.selected;
      const active = focus && (e.from === focus || e.to === focus);
      // 过滤态下：两端都还在场的边保持亮度。这些边本身就是「待治理链路」，
      // 一起压暗的话，用户看得到还亮着的方框，却看不出它们之间怎么连的。
      const a1 = scene.byId[e.from], b1 = scene.byId[e.to];
      const keptE = a1 && b1 && a1.status !== "ok" && b1.status !== "ok";
      const dim = scene.filter === "problem" ? (keptE ? 0.85 : 0.2) : 1;
      const alpha = (active ? 0.85 : 0.22) * dim;
      const col = active ? th.accent : th.text3;

      ctx.beginPath();
      ctx.moveTo(item.proj[0].x, item.proj[0].y);
      for (let i = 1; i < item.proj.length; i++) ctx.lineTo(item.proj[i].x, item.proj[i].y);
      ctx.strokeStyle = rgba(col, alpha);
      ctx.lineWidth = active ? 1.8 : 1;
      ctx.stroke();

      if (item.proj.length > 3) {
        const a = item.proj[item.proj.length - 3];
        const b = item.proj[item.proj.length - 1];
        drawArrow(ctx, a, b, col, (active ? 0.9 : 0.34) * dim);
      }

      // 流动粒子：只在相关边上跑，避免整屏噪点
      if (active) {
        for (let k = 0; k < 2; k++) {
          const t = ((scene.pulse * 0.4) + k / 2) % 1;
          const idx = Math.min(item.proj.length - 1, Math.round(t * (item.proj.length - 1)));
          const p = item.proj[idx];
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
          ctx.fillStyle = rgba(col, 0.85);
          ctx.fill();
        }
      }
    });
  }

  function drawArrow(ctx, a, b, col, alpha) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const size = 6;
    const px = b.x - ux * 2, py = b.y - uy * 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - ux * size - uy * size * 0.55, py - uy * size + ux * size * 0.55);
    ctx.lineTo(px - ux * size + uy * size * 0.55, py - uy * size - ux * size * 0.55);
    ctx.closePath();
    ctx.fillStyle = rgba(col, alpha);
    ctx.fill();
  }

  function drawHoverRing(ctx) {
    const id = scene.hover || scene.selected;
    if (!id) return;
    let bd = scene.byId[id];
    if (!bd && id.indexOf("station:") === 0) {
      const key = id.slice(8);
      bd = scene.crates.find((c) => c.station === key);
      const st = scene.stationByKey[key];
      if (!bd && st) {
        // 没有产物箱的工位（比如产出为 0）：贴在门架中心画个圈
        const p = project([st.x, RAIL_Y, 0]);
        if (!p) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(scene.theme.accent, 0.9);
        ctx.lineWidth = 2;
        ctx.stroke();
        return;
      }
    }
    if (!bd) return;
    const p = project([bd.pos[0], bd.pos[1] + bd.h, bd.pos[2]]);
    if (!p) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 2, 14, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(scene.theme.accent, 0.85);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ---------- 命中测试 ----------

  function padHit(st, mx, my) {
    const ph = padHalfZ(st);
    const hx = STATION_GAP * 0.44;
    const quad = projectAll([
      [st.x - hx, FLOOR_Y, -ph], [st.x + hx, FLOOR_Y, -ph],
      [st.x + hx, FLOOR_Y, ph], [st.x - hx, FLOOR_Y, ph],
    ]);
    if (!quad) return false;
    // 底板是个平行四边形，用叉积判内点
    let sign = 0;
    for (let i = 0; i < quad.length; i++) {
      const a = quad[i], b = quad[(i + 1) % quad.length];
      const cross = (b.x - a.x) * (my - a.y) - (b.y - a.y) * (mx - a.x);
      if (cross === 0) continue;
      const s = cross > 0 ? 1 : -1;
      if (!sign) sign = s;
      else if (s !== sign) return false;
    }
    return true;
  }

  function pick(mx, my) {
    let best = null;
    scene.nodes.concat(scene.crates).forEach(function (n) {
      // 八个角全投一遍再取屏幕包围盒。只投两个面（比如顶面+前面）会漏掉
      // 侧后方露出来的那部分，点在方块边缘会选不中。
      const pts = [];
      solidFaces(n, BOX_W, BOX_D).forEach(function (f) {
        f.pts.forEach((p) => pts.push(p));
      });
      const proj = projectAll(pts);
      if (!proj) return;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z = 0;
      proj.forEach(function (p) {
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
        z += p.z;
      });
      z /= proj.length;
      if (mx < x0 - 3 || mx > x1 + 3 || my < y0 - 3 || my > y1 + 3) return;
      // 命中多个时取最近的那个：看得见的那张才是用户想点的
      if (!best || z < best.z) best = { id: n.id, z: z };
    });
    if (best) return best.id;

    // 底板：点工位的空白处也算选中这个工位。门架很高、方块很小，
    // 只认方块的话，想点"第 4 步"几乎点不中。
    let hit = null;
    scene.stations.forEach(function (st) {
      if (padHit(st, mx, my)) {
        const p = project([st.x, FLOOR_Y, 0]);
        if (p && (!hit || p.z < hit.z)) hit = { id: "station:" + st.key, z: p.z };
      }
    });
    return hit ? hit.id : null;
  }

  // ---------- 循环 ----------

  function loop(ts) {
    scene.raf = global.requestAnimationFrame(loop);
    if (!scene.visible) return;
    if (global.document && global.document.hidden) return;

    const dt = scene.lastTs ? Math.min(0.05, (ts - scene.lastTs) / 1000) : 0;
    scene.lastTs = ts;

    if (scene.autoRotate && !scene.drag) {
      view.yaw += dt * 0.22;
    }
    scene.pulse += dt;
    render();
  }

  function start() {
    if (!scene.raf) scene.raf = global.requestAnimationFrame(loop);
  }

  // ---------- 交互 ----------

  function bind() {
    const el = canvasRef.el;
    const tip = document.getElementById("scene-tip");

    function localPos(ev) {
      const r = el.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }

    el.addEventListener("pointerdown", function (ev) {
      el.setPointerCapture(ev.pointerId);
      const pan = ev.button === 1 || ev.button === 2 || ev.shiftKey;
      scene.drag = {
        pan: pan,
        x: ev.clientX, y: ev.clientY,
        moved: 0,
        yaw0: view.yaw, pitch0: view.pitch,
        target0: view.target.slice(),
      };
      if (!pan) el.style.cursor = "grabbing";
    });

    el.addEventListener("pointermove", function (ev) {
      const pos = localPos(ev);
      if (scene.drag) {
        const dx = ev.clientX - scene.drag.x;
        const dy = ev.clientY - scene.drag.y;
        scene.drag.moved = Math.max(scene.drag.moved, Math.hypot(dx, dy));
        if (scene.drag.pan) {
          // 平移：把屏幕位移换算到相机右向量/上向量上
          const s = view.dist / view.focal;
          const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw);
          const right = [cy, 0, -sy];
          view.target = [
            scene.drag.target0[0] - (dx * s) * right[0],
            scene.drag.target0[1] + dy * s,
            scene.drag.target0[2] - (dx * s) * right[2],
          ];
        } else {
          view.yaw = scene.drag.yaw0 - dx * 0.0062;
          view.pitch = Math.max(-0.28, Math.min(1.15, scene.drag.pitch0 + dy * 0.0052));
        }
        return;
      }

      const id = pick(pos.x, pos.y);
      if (id !== scene.hover) {
        scene.hover = id;
        el.style.cursor = id ? "pointer" : "grab";
        if (tip) {
          if (id) {
            tip.innerHTML = tooltipHTML(id);
            tip.classList.add("show");
          } else {
            tip.classList.remove("show");
          }
        }
      }
      if (id && tip) {
        tip.style.left = pos.x + 16 + "px";
        tip.style.top = pos.y + 14 + "px";
      }
    });

    function endDrag(ev) {
      const wasDrag = scene.drag;
      scene.drag = null;
      el.style.cursor = scene.hover ? "pointer" : "grab";
      if (wasDrag && wasDrag.moved < 5) {
        const pos = localPos(ev);
        const id = pick(pos.x, pos.y);
        scene.selected = id === scene.selected ? null : id;
        if (scene.onSelect) scene.onSelect(itemFor(id));
      }
    }
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", function () { scene.drag = null; });

    el.addEventListener("pointerleave", function () {
      if (scene.drag) return;
      scene.hover = null;
      if (tip) tip.classList.remove("show");
    });

    el.addEventListener("contextmenu", (ev) => ev.preventDefault());

    el.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      const factor = Math.exp(ev.deltaY * 0.0012);
      view.dist = Math.max(view.fitDist * 0.22, Math.min(view.fitDist * 4.5, view.dist * factor));
    }, { passive: false });

    el.addEventListener("dblclick", function (ev) {
      const pos = localPos(ev);
      const id = pick(pos.x, pos.y);
      if (id) focusItem(id);
    });

    global.addEventListener("keydown", function (ev) {
      if (!scene.visible) return;
      const tag = (ev.target && ev.target.tagName) || "";
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (ev.key === "r" || ev.key === "R") { resetView(); }
      else if (ev.key === " ") { setAutoRotate(!scene.autoRotate); ev.preventDefault(); }
      else if (ev.key === "Escape") { select(null); }
    });

    global.addEventListener("resize", function () { setSize(); });
    if (global.matchMedia) {
      const mq = global.matchMedia("(prefers-color-scheme: dark)");
      const onChange = function () { readTheme(); };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  // 选中/悬浮统一成一个 id 空间：表用表名，工位用 "station:<key>"
  function itemFor(id) {
    if (!id) return null;
    if (id.indexOf("station:") === 0) {
      const key = id.slice(8);
      const st = scene.stationByKey[key];
      if (!st) return null;
      return Object.assign({ kind: "station", id: id }, st);
    }
    return scene.byId[id] || null;
  }

  function tooltipHTML(id) {
    const it = itemFor(id);
    if (!it) return "";
    const th = scene.theme;
    const line = function (k, v) {
      return v == null || v === "" ? "" :
        '<div class="tip-row"><span>' + k + "</span><b>" + v + "</b></div>";
    };
    if (it.kind === "station") {
      const num = CN_NUM[it.order] || (it.order + 1);
      const status = {
        ok: "已完成", running: "运行中", pending: "未运行",
        warn: "有待确认项", blocked: "被拦住了",
      }[stationStatus(it)] || stationStatus(it);
      return '<div class="tip-head">' + num + " " + it.label +
        (it.gate ? ' <span class="tip-tag">人工闸门</span>' : "") + "</div>" +
        line("状态", status) +
        line("产物", it.note) +
        line("这一步", it.hint) +
        (it.tables && it.tables.length ? line("产出表", it.tables.length + " 张") : "");
    }
    const status = {
      ok: "规则覆盖且通过", uncovered: "没有规则覆盖",
      block: "有阻断项", warn: "有提示项",
    }[it.status] || it.status;
    return '<div class="tip-head">' + it.label + "</div>" +
      line("位置", (it.domain_label || "") + " · " + (it.layer || "")) +
      line("行数", it.rows != null ? it.rows.toLocaleString() : "—") +
      line("状态", status) +
      line("产出", it.origin) +
      (it.rules && it.rules.length ? line("规则", it.rules.join(" · ")) : "");
  }

  // ---------- 对外 ----------

  function mount(canvas) {
    canvasRef.el = canvas;
    ctxRef.el = canvas.getContext("2d");
    readTheme();
    setSize();
    bind();
    start();
  }

  function setData(graph) {
    scene.graph = graph || null;
    scene.error = graph && graph.ok === false ? graph.error : null;
    buildLayout();
    readTheme();
    scene.selected = null;
    scene.hover = null;
    setSize();
    render();
  }

  function setProcess(p) {
    const prev = scene.process || {};
    const next = p || {};
    if (prev.stage !== next.stage || prev.status !== next.status) {
      scene.process = { stage: next.stage || null, status: next.status || null,
                        since: scene.pulse };
    } else {
      scene.process.status = next.status || null;
      scene.process.stage = next.stage || null;
    }
  }

  function setVisible(on) {
    scene.visible = !!on;
    if (on) {
      setSize();
      readTheme();
      render();
    }
  }

  function resize() {
    setSize();
    render();
  }

  function resetView() {
    view.yaw = DEFAULT_YAW;
    view.pitch = DEFAULT_PITCH;
    scene.needFit = true;
    fitView();
    render();
  }

  function setAutoRotate(on) {
    scene.autoRotate = !!on;
  }

  function setFilter(name) {
    scene.filter = name;
    render();
  }

  // 拉近量 = 「让这个物体占视口约一半高度」，反解 dist = focal * 2h / 视口高。
  // 为什么不能写死：写成世界单位的常数，焦距一改观感就变；写成 focal 的倍数，
  // 物体大小一改就错 —— 实测 focal * 1.5 = 5619 比 fitDist 4461 还大，
  // 按「聚焦」反而变成了拉远。只有跟物体自己的高度挂钩才永远对。
  function zoomTo(h) {
    const sh = (scene.size || { h: 800 }).h;
    const want = view.focal * (2 * h / sh);
    return Math.max(view.fitDist * 0.22, Math.min(view.fitDist, want));
  }

  function focusItem(id) {
    const it = itemFor(id);
    if (!it) return;
    if (it.kind === "station") {
      view.target = [it.x, (FLOOR_Y + POST_TOP) / 2, 0];
      view.dist = zoomTo(POST_TOP - FLOOR_Y + 60);
    } else {
      view.target = it.center.slice();
      view.dist = zoomTo(it.h + 40);
    }
    render();
  }

  function select(id) {
    scene.selected = id && itemFor(id) ? id : null;
    if (scene.onSelect) scene.onSelect(itemFor(scene.selected));
    render();
  }

  global.Scene3D = {
    mount: mount,
    setData: setData,
    setProcess: setProcess,
    setVisible: setVisible,
    resize: resize,
    resetView: resetView,
    setAutoRotate: setAutoRotate,
    setFilter: setFilter,
    focus: focusItem,
    select: select,
    onSelect: function (cb) { scene.onSelect = cb; },
    state: scene,
    // 调参用：把相机/尺寸/边界和几个关键点的屏幕坐标吐出来，
    // 比盯着截图猜「为什么这么小」可靠得多。
    debug: function () {
      const size = scene.size || { w: 1, h: 1 };
      const stations = (scene.stations || []).map(function (st) {
        const p = project([st.x, RAIL_Y, 0]);
        const top = project([st.x, RAIL_Y + BEAM_H, 0]);
        // 底板中心也报出来：验证「点工位能选中」必须瞄准底板（pick 命中的是
        // 地面那块平行四边形），拿横梁坐标去打是打不中的，缺这一项就只能靠猜。
        const fl = project([st.x, FLOOR_Y, 0]);
        return {
          key: st.key, status: stationStatus(st), x: Math.round(st.x),
          sx: p ? Math.round(p.x) : null, sy: top ? Math.round(top.y) : null,
          fx: fl ? Math.round(fl.x) : null, fy: fl ? Math.round(fl.y) : null,
        };
      });
      let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity;
      scene.nodes.concat(scene.crates).forEach(function (n) {
        solidFaces(n, BOX_W, BOX_D).forEach(function (f) {
          f.pts.forEach(function (pt) {
            const p = project(pt);
            if (!p) return;
            sMinX = Math.min(sMinX, p.x); sMaxX = Math.max(sMaxX, p.x);
            sMinY = Math.min(sMinY, p.y); sMaxY = Math.max(sMaxY, p.y);
          });
        });
      });
      const boxPx = scene.nodes.length
        ? Math.round(BOX_W * view.focal / view.dist) : 0;
      const fl = scene.flow || {};
      const lit = litToX();
      return {
        dist: Math.round(view.dist),
        fitDist: Math.round(view.fitDist),
        focal: Math.round(view.focal),
        fovDeg: Math.round(2 * Math.atan((size.h / 2) / view.focal) * 180 / Math.PI),
        yaw: +view.yaw.toFixed(3),
        pitch: +view.pitch.toFixed(3),
        target: view.target.map(function (t) { return Math.round(t); }),
        size: scene.size,
        nodeCount: scene.nodes.length,
        crateCount: scene.crates.length,
        stationCount: scene.stations.length,
        stationGapPx: stations.length > 1 && stations[0].sx != null && stations[1].sx != null
          ? Math.abs(stations[1].sx - stations[0].sx) : null,
        boxPx: boxPx,
        rail: {
          litToX: Math.round(lit),
          railX0: Math.round(railX0()),
          railX1: Math.round(railX1()),
          litRatio: +(Math.max(0, lit - railX0()) /
            Math.max(1, railX1() - railX0())).toFixed(3),
        },
        flow: { done: fl.done, total: fl.total, frontier: fl.frontier,
                frontierKey: fl.frontier_key, gateLocked: fl.gate_locked },
        // 颗粒的位置。验收「画面真的在动」就靠它：隔 300ms 取两次，
        // 世界坐标和屏幕坐标都该变了；不变就说明动画根本没跑。
        particles: flowParticles().slice(0, 4).map(function (p) {
          const q = project([p.x, RAIL_Y + 3, p.z]);
          return { i: p.i, x: Math.round(p.x), sx: q ? Math.round(q.x) : null };
        }),
        gate: (function () {
          const g = gateStation();
          if (!g) return null;
          const gg = gateGeometry(g);
          const p = project([g.x, RAIL_Y, 0]);
          return { key: g.key, x: Math.round(g.x), locked: gg.locked,
                   approved: gg.approved, sx: p ? Math.round(p.x) : null };
        })(),
        railSegments: railSegments().map(function (s) {
          return { x0: Math.round(s.x0), x1: Math.round(s.x1), lit: s.lit };
        }),
        process: scene.process,
        filter: scene.filter,
        selected: scene.selected,
        hover: scene.hover,
        error: scene.error,
        stations: stations,
        bodies: scene.nodes.slice(0, 6).map(function (n) {
          const p = project(n.top);
          return { id: n.id, station: n.station, h: Math.round(n.h),
                   sx: p ? Math.round(p.x) : null, sy: p ? Math.round(p.y) : null };
        }),
        fill: {
          x: +((sMaxX - sMinX) / size.w).toFixed(3),
          y: +((sMaxY - sMinY) / size.h).toFixed(3),
          rect: [Math.round(sMinX), Math.round(sMinY), Math.round(sMaxX), Math.round(sMaxY)],
        },
        fitInfo: scene.fitInfo || null,
      };
    },
    // 验收用：数一数某一帧里有多少个"亮像素"，用来证明流动颗粒真的在动
    // （连续两帧的像素差不等于 0，就说明画面在动）。
    energy: function () {
      const c = canvasRef.el;
      if (!c) return null;
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let sum = 0, lit = 0;
      for (let i = 0; i < d.length; i += 16) {
        const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
        sum += v;
        if (v > 150) lit++;
      }
      return { meanLum: Math.round(sum / (d.length / 16)), litPixels: lit };
    },
  };
})(window);
