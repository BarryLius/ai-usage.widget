// ============================================================
//  ai-usage.widget / index.jsx   (Übersicht)
//  数据来自 fetch-usage.py：本地 CLI(ccusage)读取本机用量日志
//  显示已用 / 上限 + 重置倒计时,进度条四档变色,包豪斯风格
// ============================================================

// 经登录 shell 运行,确保 node/npx/python3 都在 PATH(ccusage 通过 npx 调用)
export const command = "/bin/zsh -lc 'python3 ai-usage.widget/fetch-usage.py'";
export const refreshFrequency = 15 * 60 * 1000; // 15 分钟

// ---------- 调色板 ----------
const C = {
  paper: "#F2EDE2", card: "#FFFFFF", black: "#111111", gray: "#9A9A9A",
  claude: "#D97757", gpt: "#10A37F",
  red: "#E63946", orange: "#F08A1F", yellow: "#F4C430", green: "#3A9D5D", blue: "#1D4E89",
};

const accent = (r) =>
  r >= 0.85 ? C.red : r >= 0.65 ? C.orange : r >= 0.4 ? C.yellow : C.green;

// 柱状图配色:柱内竖向渐变,沿用日进度条(fillStyle)同一套色标 green→yellow→
// orange→red,并以「每日上限」为锚点 —— 值=日限时正好铺满整条渐变(顶部为红),
// 与日进度条 100% 时同色;超出日限的部分继续保持红色。dayLim 缺失或 val=0 时纯绿。
function barFill(val, dayLim) {
  if (!(dayLim > 0) || !(val > 0)) return { background: C.green };
  const grad = `linear-gradient(to top, ${C.green} 0%, ${C.yellow} 40%, ${C.orange} 65%, ${C.red} 85%)`;
  const sizePct = (dayLim / val) * 100; // 把整条渐变锚定到「0→日限」这段高度上
  return {
    background: `${grad} bottom / 100% ${sizePct}% no-repeat, ${C.red}`,
  };
}

// 进度条填充用渐变色：把 green→yellow→orange→red 的色段锁定到「整条轨道」
// 上,fill 只是把渐变裁成当前进度宽度。这样 50% 时右端正好是黄/橙过渡处。
function fillStyle(r) {
  const grad = `linear-gradient(to right, ${C.green} 0%, ${C.yellow} 40%, ${C.orange} 65%, ${C.red} 85%)`;
  return {
    width: r * 100 + "%",
    background: grad,
    backgroundSize: r > 0 ? (100 / r) + "% 100%" : "100% 100%",
    backgroundRepeat: "no-repeat",
  };
}

// ---------- 活跃热力图(GitHub 风格)----------
// 把升序日序列按「周」打包成列:每列 7 行(周日→周六),空位补 null。
// 序列连续(脚本逐日补 0),按 周日对齐 的列下标定位,跨月/跨周都不会错位。
function buildHeatmap(series, useTok) {
  if (!series || !series.length) return [];
  const cells = series.map((d) => ({
    date: d.date,
    val: useTok ? (d.tokens || 0) : (d.cost || 0),
    day: d,
  }));
  const first = new Date(cells[0].date + "T00:00:00");
  const sunday = new Date(first);
  sunday.setDate(first.getDate() - first.getDay()); // 回退到所在周的周日
  const cols = [];
  cells.forEach((c) => {
    const dt = new Date(c.date + "T00:00:00");
    const ci = Math.floor(Math.round((dt - sunday) / 86400000) / 7);
    const wd = dt.getDay();
    if (!cols[ci]) cols[ci] = { cells: new Array(7).fill(null), label: "" };
    cols[ci].cells[wd] = c;
  });
  for (let i = 0; i < cols.length; i++)
    if (!cols[i]) cols[i] = { cells: new Array(7).fill(null), label: "" };
  // 月份标签:每列首个有效日的月份若与上一列不同,则在该列顶部标注。
  let prevM = -1;
  cols.forEach((col) => {
    const f = col.cells.find(Boolean);
    if (f) {
      const m = new Date(f.date + "T00:00:00").getMonth();
      col.label = m !== prevM ? (m + 1) + "月" : "";
      prevM = m;
    }
  });
  return cols;
}

// 活跃度 → 透明度:返回一个映射函数。用「分位」而非「值/峰值」——
// 即某天在所有「有用量日」里排第几,避免个别高峰把其余日子全压成浅色,
// 让深浅分布更均匀、层次更细。空白日返回 null(走轨道色)。
function makeHeatScale(series, useTok) {
  const vals = (series || [])
    .map((d) => (useTok ? d.tokens : d.cost) || 0)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const n = vals.length;
  return (val) => {
    if (!(val > 0)) return null;
    if (n <= 1) return 0.85;
    // 二分求该值的秩(同值取平均秩),换算成 0~1 分位
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (vals[m] < val) lo = m + 1; else hi = m; }
    let hi2 = lo; while (hi2 < n && vals[hi2] === val) hi2++;
    const pct = ((lo + hi2) / 2) / n;          // 0~1
    return 0.14 + 0.86 * pct;                   // 透明度 0.14 → 1.0,层次更细
  };
}

// 紧凑 token 数:1.2M / 850k
function fmtTok(n) {
  if (!n) return "0";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e7) return Math.round(n / 1e6) + "M";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return Math.round(n / 1e3) + "k";
  return String(n);
}

function resetText(iso) {
  if (!iso) return "";
  const r = new Date(iso);
  if (isNaN(r.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  const clk = p(r.getHours()) + ":" + p(r.getMinutes());
  const diff = r.getTime() - Date.now();
  if (diff <= 0) return "重置 " + clk;
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
  return "重置 " + clk + " · 剩 " + (h > 0 ? h + "h" : "") + m + "m";
}

// 重置倒计时:"Xd Yh 后重置" / "Xh Ym 后重置" / "Ym 后重置"
function resetCountdown(iso) {
  if (!iso) return "—";
  const r = new Date(iso).getTime();
  if (isNaN(r)) return "—";
  let diff = r - Date.now();
  if (diff <= 0) return "即将重置";
  const d = Math.floor(diff / 86400000); diff -= d * 86400000;
  const h = Math.floor(diff / 3600000); diff -= h * 3600000;
  const m = Math.floor(diff / 60000);
  const s = d > 0 ? d + "d " + h + "h" : h > 0 ? h + "h " + m + "m" : m + "m";
  return s + " 后重置";
}

// 重置的绝对时刻:当天显示 "HH:MM";次日 "明天 HH:MM";更远 "M/D HH:MM"
function resetClock(iso) {
  if (!iso) return "";
  const r = new Date(iso);
  if (isNaN(r.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  const hhmm = p(r.getHours()) + ":" + p(r.getMinutes());
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const rd = new Date(r); rd.setHours(0, 0, 0, 0);
  const days = Math.round((rd.getTime() - t0.getTime()) / 86400000);
  if (days <= 0) return hhmm;
  if (days === 1) return "明天 " + hhmm;
  return (r.getMonth() + 1) + "/" + r.getDate() + " " + hhmm;
}

// 周期已过时间比例(0~1):按窗口长度 hours 由「重置时刻」反推起点。
// 主进度条对应会话窗口(默认 5h);用于绿色时间标记与「持续到重置」判断。
function periodElapsed(iso, hours) {
  if (!iso) return 0;
  const reset = new Date(iso).getTime();
  if (isNaN(reset)) return 0;
  const total = hours * 3600000;
  return Math.min(1, Math.max(0, (Date.now() - (reset - total)) / total));
}
// 窗口长度(小时)——仅用于绿色「已过时间」标记的横向定位;
// 百分比与重置倒计时都来自官方 resets_at,不依赖这两个常量。
// 官方接口只返回 resets_at(窗口结束),不返回窗口长度,故此处用 Claude 的固定窗口:
const SESSION_HOURS = 5;       // 会话:5h 滚动窗口
const WEEK_HOURS = 7 * 24;     // 每周:7 天

// 每周窗口:以本地周一 00:00 为锚点(ccusage 无官方周重置,这里按自然周近似)。
// 返回本周起点(周一)与下次重置(下周一)。
function weekReset() {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((now.getDay() + 6) % 7)); // 周一=0…周日=6
  const next = new Date(monday);
  next.setDate(monday.getDate() + 7);
  return { monday, resetISO: next.toISOString() };
}

// 本月已过时间比例(Codex 主条按自然月)
function monthElapsed() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
}

// ---------- 实际刷新时间 / “x 分钟前” ----------
function agoText(ts) {
  if (!ts) return "刚刚";
  const m = Math.floor((Date.now() / 1000 - Number(ts)) / 60);
  if (m <= 0) return "刚刚";
  if (m < 60) return m + "分钟前";
  return Math.floor(m / 60) + "小时前";
}
function setAgoSpan(el, ts) {
  if (!el) return;
  if (ts) el.setAttribute("data-ts", String(ts));
  else el.removeAttribute("data-ts");
  el.textContent = "(" + agoText(ts) + ")";
}
function setSub(el, date, asOf, ts) {
  if (!el) return;
  el.textContent = (date ? date + " · " : "") + asOf + " ";
  const span = document.createElement("span");
  span.className = "ai-ago";
  setAgoSpan(span, ts);
  el.appendChild(span);
  el.appendChild(document.createTextNode(" · 订阅额度"));
}
function startAgoTicker() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (window.__aiAgoTimer) return;
  window.__aiAgoTimer = setInterval(() => {
    document.querySelectorAll(".ai-ago").forEach((el) => {
      setAgoSpan(el, el.getAttribute("data-ts"));
    });
  }, 30000);
}

// ---------- 拖动 + 记忆位置(localStorage) ----------
// Übersicht 原生不支持拖动,这里给 .wrap 加鼠标拖拽并持久化坐标。
const POS_KEY = "ai-usage-widget-pos";
function initWrap(node) {
  if (!node || node.__dragInit) return;
  node.__dragInit = true;
  startAgoTicker();

  try {
    const s = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    if (s && typeof s.left === "number" && typeof s.top === "number") {
      node.style.left = s.left + "px";
      node.style.top = s.top + "px";
    }
  } catch (e) {}

  let drag = null;
  const onMove = (e) => {
    if (!drag) return;
    node.style.left = drag.ox + (e.clientX - drag.sx) + "px";
    node.style.top = drag.oy + (e.clientY - drag.sy) + "px";
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    if (drag) {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify({
          left: parseInt(node.style.left, 10) || 0,
          top: parseInt(node.style.top, 10) || 0,
        }));
      } catch (e) {}
    }
    drag = null;
  };
  node.addEventListener("mousedown", (e) => {
    const r = node.getBoundingClientRect();
    drag = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top };
    e.preventDefault();
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

// 用系统默认浏览器打开外链(Übersicht 全局 run 执行 macOS `open`)
function openExternal(url) {
  if (!url || typeof run !== "function") return;
  run("open " + JSON.stringify(url)).catch(() => {});
}

// ---------- 柱状图:悬停明细面板 ----------
function fmtDate(iso) {
  const p = String(iso).split("-");
  return p.length >= 3 ? +p[1] + "月" + +p[2] + "日" : iso;
}

// 按需(重)播一段动画:先清掉再强制回流,保证复用元素也能重新触发。
function playAnim(el, anim) {
  if (!el) return;
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = anim;
}

// 用 DOM 直接填充明细(Übersicht 的 render 不走 hooks,悬停状态用 DOM 维护)。
// animate=true 时(悬停换日)淡入;初始渲染传 false,避免每次刷新都闪一下。
function showDetail(panel, day, brand, animate) {
  if (!panel || !day) return;
  const head = panel.querySelector(".cdhd");
  if (head) {
    head.textContent =
      fmtDate(day.date) + ": $" + Number(day.cost || 0).toFixed(2) +
      " · " + fmtTok(day.tokens || 0) + " tokens";
    if (animate) playAnim(head, "cdfade .26s ease both");
  }
  const box = panel.querySelector(".cdmodels");
  if (!box) { syncDetailHeight(panel); return; }
  box.textContent = "";
  const models = day.models || [];
  if (!models.length) {
    const e = document.createElement("div");
    e.className = "cdempty";
    e.textContent = "无模型明细";
    if (animate) e.style.animation = "cdfade .26s ease both";
    box.appendChild(e);
    syncDetailHeight(panel);
    return;
  }
  models.forEach((m, i) => {
    const row = document.createElement("div");
    row.className = "cdrow";
    if (animate) {                       // 逐行错开淡入
      row.style.animation = "cdfade .26s ease both";
      row.style.animationDelay = (i * 0.035) + "s";
    }
    const tick = document.createElement("i");
    tick.className = "cdtick";
    tick.style.background = brand;
    const txt = document.createElement("div");
    txt.className = "cdtxt";
    const nm = document.createElement("div");
    nm.className = "cdname";
    nm.textContent = m.name;
    const vv = document.createElement("div");
    vv.className = "cdval";
    vv.textContent = "$" + Number(m.cost || 0).toFixed(2) + " · " + fmtTok(m.tokens || 0);
    txt.appendChild(nm);
    txt.appendChild(vv);
    row.appendChild(tick);
    row.appendChild(txt);
    box.appendChild(row);
  });
  syncDetailHeight(panel);
}

// 明细行数变化会改变面板高度;若图表展开,让外层高度平滑跟随。
function syncDetailHeight(panel) {
  const chart = panel && panel.closest(".chartwrap");
  if (chart && chart.classList.contains("open")) syncChartHeight(chart);
}

// 默认展示最近一个有用量的日子
function initDetail(node, series, brand) {
  if (!node || !series || !series.length) return;
  let day = null;
  for (let i = series.length - 1; i >= 0; i--) {
    if ((series[i].cost || 0) > 0) { day = series[i]; break; }
  }
  showDetail(node, day || series[series.length - 1], brand, false);
}

// ---------- 柱状图:展开状态记忆 + 横向拖动滚动 ----------
function toggleChart(e, pid) {
  e.stopPropagation();
  const head = e.currentTarget;
  const card = head.closest(".card");
  const chart = card && card.querySelector(".chartwrap");
  if (!chart) return;
  const open = chart.classList.toggle("open");
  head.classList.toggle("open", open);
  try { localStorage.setItem("ai-usage-chart-" + pid, open ? "1" : "0"); } catch (e2) {}
  syncChartHeight(chart);
  if (open) scrollActive(chart);
}

// 把外层高度精确同步到当前内容:展开取真实 scrollHeight(随视图/明细变化平滑过渡),
// 收缩归 0。读 scrollHeight 会强制回流,拿到的是切换后(display 生效后)的真实高度。
function syncChartHeight(chart) {
  if (!chart) return;
  chart.style.maxHeight = chart.classList.contains("open")
    ? (chart.scrollHeight + 4) + "px"
    : "0px";
}

// 滚到最新:按当前视图(柱状/热力)选对应的横向滚动容器。
function scrollActive(chart) {
  const mode = chart.getAttribute("data-mode") === "heat" ? "heat" : "bar";
  const sc = chart.querySelector(mode === "heat" ? ".heatscroll" : ".chartscroll");
  if (sc) requestAnimationFrame(() => { sc.scrollLeft = sc.scrollWidth; });
}

// 切换 柱状 / 热力 视图:换视图后高度会变,重新同步让外层平滑过渡,再滚到最新。
function setChartMode(e, pid, mode) {
  e.stopPropagation();
  const chart = e.currentTarget.closest(".chartwrap");
  if (!chart) return;
  chart.setAttribute("data-mode", mode);
  try { localStorage.setItem("ai-usage-chartmode-" + pid, mode); } catch (e2) {}
  playAnim(chart.querySelector(mode === "heat" ? ".heatwrap" : ".chartscroll"), "viewfade .28s ease");
  syncChartHeight(chart);
  scrollActive(chart);
}

// 给横向滚动容器加「按住拖动」滚动(柱状图、热力图共用)。
function initDragScroll(sc) {
  if (!sc || sc.__dragInit) return;
  sc.__dragInit = true;
  sc.addEventListener("mousedown", (e) => {
    e.stopPropagation();              // 不触发整窗拖动
    const start = { x: e.clientX, sl: sc.scrollLeft };
    const mv = (ev) => { sc.scrollLeft = start.sl - (ev.clientX - start.x); };
    const up = () => {
      document.removeEventListener("mousemove", mv);
      document.removeEventListener("mouseup", up);
      sc.classList.remove("grabbing");
    };
    document.addEventListener("mousemove", mv);
    document.addEventListener("mouseup", up);
    sc.classList.add("grabbing");
    e.preventDefault();
  });
}

function initChart(node, pid) {
  if (!node) return;
  let open = false, mode = "bar";
  try { open = localStorage.getItem("ai-usage-chart-" + pid) === "1"; } catch (e) {}
  try { mode = localStorage.getItem("ai-usage-chartmode-" + pid) || "bar"; } catch (e) {}
  node.setAttribute("data-mode", mode === "heat" ? "heat" : "bar");
  const card = node.closest(".card");
  const head = card && card.querySelector(".sthd");
  if (open) {
    node.classList.add("open");
    if (head) head.classList.add("open");
  }

  initDragScroll(node.querySelector(".chartscroll"));
  initDragScroll(node.querySelector(".heatscroll"));
  // 初始高度直接就位,关掉过渡避免每次刷新(整窗重渲染)都重播展开动画
  const prevT = node.style.transition;
  node.style.transition = "none";
  syncChartHeight(node);
  requestAnimationFrame(() => { node.style.transition = prevT || ""; });
  if (open) scrollActive(node);
}

// ---------- 根样式 ----------
export const className = `
  top: 0; left: 0;
  font-family: 'Futura', 'Helvetica Neue', -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;

  /* 主题变量:浅色默认,夜间模式由系统 prefers-color-scheme 覆盖。
     强调色(橙/绿/红/黄/蓝)两种模式通用,不放进变量。 */
  --paper: #F2EDE2; --card: #FFFFFF; --ink: #111111; --muted: #9A9A9A;
  --track: #F2EDE2; --track2: rgba(0,0,0,0.10); --barframe: #111111; --tick: #111111; --tickmini: rgba(0,0,0,0.25);
  --line: rgba(0,0,0,0.10); --hover: rgba(0,0,0,0.08); --scroll: rgba(0,0,0,0.18);
  --shadow: rgba(0,0,0,0.18);
  color: var(--ink);

  @media (prefers-color-scheme: dark) {
    --paper: #1C1C1E; --card: #2C2C2E; --ink: #F5F5F7; --muted: #8E8E93;
    --track: #3A3A3C; --track2: rgba(255,255,255,0.16); --barframe: rgba(255,255,255,0.12); --tick: #F5F5F7; --tickmini: rgba(255,255,255,0.28);
    --line: rgba(255,255,255,0.12); --hover: rgba(255,255,255,0.10); --scroll: rgba(255,255,255,0.22);
    --shadow: rgba(0,0,0,0.55);
  }

  /* 拖动:位置由 .wrap 自身的 fixed 定位决定,松手后存 localStorage */
  .wrap {
    position: fixed; top: 40px; left: 40px; width: 320px;
    cursor: move; user-select: none;
    background: var(--paper); border-radius: 22px; padding: 18px 18px 16px;
    box-shadow: 0 10px 30px var(--shadow);
  }

  /* 刷新按钮:接管 decor 中的圆形位,保留红色包豪斯风格 */
  .rfbtn {
    width: 16px; height: 16px; padding: 0;
    border: 0; border-radius: 50%;
    background: ${C.red}; color: #fff;
    font-size: 11px; line-height: 14px; font-weight: 800;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: transform .2s ease, filter .15s ease;
  }
  .rfbtn:hover { filter: brightness(1.15); }
  /* 持续转,直到 markRefreshDone() 摘掉 class(见下方刷新逻辑),不是固定时长播一次 */
  .rfbtn.spin { animation: rfspin .8s linear infinite; }
  @keyframes rfspin { from { transform: rotate(0); } to { transform: rotate(360deg); } }

  .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .tag { font-size: 17px; font-weight: 800; letter-spacing: 1px; }
  .sub { font-size: 9px; color: var(--muted); margin-top: 2px; letter-spacing: .5px; }
  .decor { display: flex; gap: 6px; align-items: center; }
  .decor .tri { width: 0; height: 0; border-left: 9px solid transparent; border-right: 9px solid transparent; border-bottom: 18px solid ${C.blue}; }
  .decor .sq { width: 16px; height: 16px; border-radius: 4px; background: ${C.yellow}; }
  .decor .ci { width: 16px; height: 16px; border-radius: 50%; background: ${C.red}; }

  .card { background: var(--card); border-radius: 18px; padding: 13px 15px; margin-top: 11px; }
  .card:first-of-type { margin-top: 0; }

  .ctop { display: flex; align-items: center; }
  .ctop .cnames { margin-left: 10px; display: flex; flex-direction: column; min-width: 0; }
  .ctop .name { font-size: 18px; font-weight: 800; line-height: 1.1; }
  .ctop .acct { font-size: 10px; color: var(--muted); margin-top: 2px; letter-spacing: .2px;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ctop .acct.link { cursor: pointer; }
  .ctop .acct.link:hover { color: var(--ink); text-decoration: underline; }
  .ctop .badge { margin-left: auto; color: #fff; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 7px; letter-spacing: .5px; align-self: flex-start; }

  .mid { display: flex; align-items: flex-end; margin: 9px 0 7px; }
  .mid .num { font-size: 28px; font-weight: 800; line-height: 1; }
  .mid .unit { font-size: 12px; font-weight: 600; color: var(--muted); margin-left: 6px; }
  .mid .pct { margin-left: auto; font-size: 22px; font-weight: 800; }

  /* 进度行:会话/每周共用。标题行(标题 + 使用率)+ 细条 + 绿色时间标记 + 重置行 */
  .prow { margin-top: 11px; }
  /* 标题行:标题与使用率同号(22px,强调色 = 原 .mid .pct) */
  .prowhd { display: flex; align-items: flex-end; }
  .prowhd .ptitle { font-size: 22px; font-weight: 800; line-height: 1; letter-spacing: .5px; }
  .prowhd .ppct { margin-left: auto; font-size: 22px; font-weight: 800; line-height: 1; }
  .pbar { margin: 9px 0 6px; }
  .ptrack { position: relative; height: 8px; background: var(--track2); border-radius: 4px; }
  .pused { position: absolute; left: 0; top: 0; height: 100%; min-width: 8px; border-radius: 4px;
           transition: width .4s ease, background .3s ease; }
  /* 叠在已用段(.pused)之上:实色(--tick,浅色近黑/深色近白)+ 卡片色描边(同 .ppace 手法),
     保证空轨道(浅灰底)和任意填充色(绿/黄/橙/红)上都清晰可辨 */
  .ptick { position: absolute; top: 1px; bottom: 1px; width: 1.5px; border-radius: 1px;
           background: var(--tick); box-shadow: 0 0 0 1px var(--card); }
  /* 绿色时间标记:略高出轨道,外描一圈卡片色与已用段分离 */
  .ppace { position: absolute; top: -2px; bottom: -2px; width: 3px; border-radius: 2px;
           background: ${C.green}; box-shadow: 0 0 0 1.5px var(--card); transition: left .4s ease; }
  /* 条下方文字:大小同 traffic 的「使用量」(.fval 11px);余量数值 / 重置文字用黑色 */
  .plabels { display: flex; font-size: 11px; color: var(--muted); letter-spacing: .3px; }
  .plabels .pleft b { color: var(--ink); font-weight: 400; }
  .plabels .pright { margin-left: auto; color: var(--ink); }
  .plabels .perr { color: ${C.red}; font-weight: 700; }

  .foot { margin-top: 6px; font-size: 9px; color: var(--muted); letter-spacing: .3px; }
  .foot.err { color: ${C.red}; font-weight: 700; }

  .stats { margin-top: 9px; padding-top: 8px; border-top: 1px dashed var(--line); }
  .st { display: flex; align-items: center; font-size: 10px; margin-top: 4px; }
  .st:first-child { margin-top: 0; }
  .st i { font-style: normal; color: var(--muted); letter-spacing: 1px; width: 16px; flex: none; }
  .st .sval { color: var(--ink); font-weight: 800; min-width: 80px; }
  .st .sval em { font-style: normal; color: var(--muted); font-weight: 500; margin-left: 3px; }
  .st .spct { font-weight: 800; min-width: 32px; text-align: right; margin-right: 6px; }
  .st .smini { position: relative; flex: 1; height: 4px; background: var(--track); border-radius: 2px; margin-right: 8px; overflow: hidden; }
  .st .smini .sfill { position: absolute; left: 0; top: 0; height: 100%; border-radius: 2px; }
  .st .smini .stick { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--tickmini); }
  .st .srem { color: var(--muted); min-width: 56px; text-align: right; }

  /* 展开箭头(点击切换柱状图) */
  .sthd { display: flex; align-items: center; cursor: pointer; user-select: none;
          font-size: 10px; color: var(--muted); margin-top: 8px; }
  .sthd:hover { color: var(--ink); }
  .sthd .arw { margin-left: auto; font-size: 15px; font-weight: 900; line-height: 1;
               transition: transform .25s ease; }
  .sthd.open .arw { transform: rotate(90deg); }

  /* 每日柱状图:外层折叠,内层横向拖动滚动。
     高度由 JS 按真实内容精确设置(syncChartHeight)——固定 max-height 会在收缩时
     先空走一段再开始动,造成卡顿;精确高度则展开/收缩/切换标签都顺滑。 */
  .chartwrap { max-height: 0; overflow: hidden;
               transition: max-height .3s ease, margin-top .3s ease; }
  .chartwrap.open { margin-top: 6px; }
  /* 切换柱状/热力、悬停换日的淡入动画由 JS 按需触发(playAnim),
     不挂在选择器上,避免每次 15 分钟整窗刷新都重播一遍。 */
  @keyframes viewfade { from { opacity: 0; } to { opacity: 1; } }
  .chartscroll { overflow-x: auto; overflow-y: hidden; cursor: default; padding-bottom: 4px; }
  .chartscroll.grabbing { cursor: default; }
  .chartscroll::-webkit-scrollbar { height: 5px; }
  .chartscroll::-webkit-scrollbar-thumb { background: var(--scroll); border-radius: 3px; }
  .chartscroll::-webkit-scrollbar-track { background: transparent; }
  .chartbars { display: flex; align-items: flex-end; gap: 3px; height: 84px; width: max-content; }
  .cbar { width: 9px; flex: none; height: 100%; display: flex; align-items: flex-end;
          border-radius: 3px; transition: background .12s ease, box-shadow .12s ease; }
  /* box-shadow 向两侧各扩 2px(柱距 3px),略宽于柱身又不压到相邻柱 */
  .cbar:hover { background: var(--hover); box-shadow: 0 0 0 2px var(--hover); }
  .cbar > i { display: block; width: 100%; border-radius: 2px 2px 0 0; min-height: 2px;
              transition: height .2s ease; }
  .chartcap { display: flex; justify-content: space-between; font-size: 9px;
              color: var(--muted); margin-top: 3px; letter-spacing: .3px; }

  /* 视图切换:柱状 / 热力 */
  .chartmode { display: flex; gap: 4px; margin-bottom: 7px; }
  .cmbtn { font: inherit; font-size: 9px; font-weight: 700; letter-spacing: .5px;
           color: var(--muted); background: var(--track); border: 0; border-radius: 6px;
           padding: 3px 9px; cursor: pointer; transition: color .15s ease, background .15s ease; }
  .cmbtn:hover { color: var(--ink); }
  .chartwrap[data-mode="bar"]  .cmbtn[data-m="bar"],
  .chartwrap[data-mode="heat"] .cmbtn[data-m="heat"] { color: var(--card); background: var(--ink); }
  /* 按视图显示对应内容 */
  .chartwrap[data-mode="bar"]  .heatwrap,
  .chartwrap[data-mode="heat"] .chartscroll,
  .chartwrap[data-mode="heat"] .chartcap { display: none; }

  /* 活跃热力图(GitHub 风格):横向按周排列覆盖近一年,主题色 + 透明度表活跃度 */
  /* padding-top 给悬浮描边(外扩 1.5px 的 box-shadow)留空间,否则最上一行被 overflow 裁掉 */
  .heatscroll { overflow-x: auto; overflow-y: hidden; cursor: default; padding: 2px 0 4px; }
  .heatscroll::-webkit-scrollbar { height: 5px; }
  .heatscroll::-webkit-scrollbar-thumb { background: var(--scroll); border-radius: 3px; }
  .heatscroll::-webkit-scrollbar-track { background: transparent; }
  .heatgrid { width: max-content; }
  .heatbody { display: flex; align-items: flex-start; }
  /* 左侧星期列:横向滚动时 sticky 固定在左缘,背景遮住下方滚过的格子 */
  .heatdays { position: sticky; left: 0; z-index: 2; background: var(--card);
              display: flex; flex-direction: column; gap: 2px; width: 11px;
              padding-right: 2px; flex: none; }
  .heatdays span { height: 11px; font-size: 8px; line-height: 11px; color: var(--muted); }
  .heatcols { display: flex; gap: 2px; }
  .heatcol { display: flex; flex-direction: column; gap: 2px; }
  .hcell { width: 11px; height: 11px; border-radius: 2.5px; background: var(--track);
           transition: transform .1s ease, box-shadow .1s ease; }
  .hcell.on { cursor: pointer; }
  .hcell.on:hover { box-shadow: 0 0 0 1.5px var(--ink); }
  /* 月份标签:置于网格下方,首格为 sticky 占位(对齐并遮挡左缘星期列宽 13px) */
  .heatmonths { display: flex; margin-top: 4px; }
  .heatmonths .hmspace { position: sticky; left: 0; z-index: 2; width: 13px; flex: none;
                         background: var(--card); }
  .heatmonths .hmlabel { width: 13px; flex: none; font-size: 8px; color: var(--muted);
                         letter-spacing: 0; white-space: nowrap; overflow: visible; }

  /* 悬停明细面板 */
  .cdetail { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--line); }
  .cdhd { font-size: 12px; font-weight: 800; color: var(--ink); margin-bottom: 7px; }
  .cdrow { display: flex; align-items: stretch; margin-top: 7px; }
  .cdrow:first-child { margin-top: 0; }
  .cdtick { width: 3px; border-radius: 2px; flex: none; margin-right: 9px; align-self: stretch; }
  .cdtxt { display: flex; flex-direction: column; }
  .cdname { font-size: 12px; font-weight: 700; color: var(--ink); }
  .cdval { font-size: 11px; color: var(--muted); margin-top: 1px; }
  .cdempty { font-size: 10px; color: var(--muted); }
  /* 悬停换日时明细行淡入+轻微上移(仅 hover 触发,JS 设置;每行错开 delay) */
  @keyframes cdfade { from { opacity: 0; transform: translateY(5px); }
                      to   { opacity: 1; transform: none; } }
  .cdtotal { margin-top: 9px; padding-top: 8px; border-top: 1px dashed var(--line);
             font-size: 11px; color: var(--muted); }
  .cdtotal b { color: var(--ink); font-weight: 800; }

  .loading { position: fixed; top: 40px; left: 40px; width: 320px; box-sizing: border-box; background: var(--paper); border-radius: 22px; padding: 24px; font-size: 13px; color: var(--muted); }
`;

// ---------- 内联 SVG Logo ----------
const ClaudeLogo = () => {
  const cx = 14, cy = 14, n = 11, spokes = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    spokes.push(
      <line key={i}
        x1={cx + Math.cos(a) * 2.4} y1={cy + Math.sin(a) * 2.4}
        x2={cx + Math.cos(a) * 9} y2={cy + Math.sin(a) * 9}
        stroke={C.paper} strokeWidth="2" strokeLinecap="round" />
    );
  }
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="14" fill={C.claude} />
      {spokes}
      <circle cx="14" cy="14" r="2" fill={C.paper} />
    </svg>
  );
};

const GptLogo = () => {
  const cx = 14, cy = 14, n = 6, ring = 7, parts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * ring, y = cy + Math.sin(a) * ring;
    parts.push(
      <g key={i}>
        <line x1={cx} y1={cy} x2={x} y2={y} stroke="#fff" strokeWidth="1.2" />
        <circle cx={x} cy={y} r="2" fill="#fff" />
      </g>
    );
  }
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <rect width="28" height="28" rx="8" fill={C.gpt} />
      {parts}
      <circle cx="14" cy="14" r="2.6" fill="#fff" />
    </svg>
  );
};

// ---------- 进度行(标题 + 使用率 + 细条 + 时间标记 + 重置),会话/每周共用 ----------
// 标题=原 .mid .num(28px),使用率=原 .mid .pct(22px,强调色),重置=traffic .fval(11px)
const ProgRow = ({ tag, pct, color, elapsed, resetISO, ok, error }) => (
  <div className="prow">
    <div className="prowhd">
      <span className="ptitle">{tag}</span>
      {ok ? <span className="ppct" style={{ color }}>{pct}%</span> : null}
    </div>
    <div className="pbar">
      <div className="ptrack">
        <i className="pused" style={fillStyle(pct / 100)} />
        <i className="ptick" style={{ left: "25%" }} />
        <i className="ptick" style={{ left: "50%" }} />
        <i className="ptick" style={{ left: "75%" }} />
        <i className="ppace" style={{ left: Math.round(elapsed * 100) + "%" }} />
      </div>
    </div>
    {ok
      ? <div className="plabels">
          <span className="pleft">余量 <b>{Math.max(0, 100 - pct)}%</b></span>
          <span className="pright">{resetCountdown(resetISO)} · {resetClock(resetISO)}</span>
        </div>
      : <div className="plabels"><span className="perr">⚠ {error || "无数据"}</span></div>}
  </div>
);

// ---------- 服务卡片 ----------
const Card = ({ prov, brand, Logo, pid }) => {
  const ratio = Math.min(prov.ratio || 0, 1);
  const usedPct = Math.round(ratio * 100);
  const useTok = prov.unit === "Mtok";
  const series = prov.series || [];
  const isClaude = pid === "claude";
  // 官方用量(归一化:{session,week,opus},Claude=oauth/usage,Codex=wham/usage)
  const official = prov.usage || null;
  const oSession = official && official.session;
  const oWeek = official && official.week;
  // 模型维度的「每周」限额(现为 Fable,旧版为 Opus);按每周条规则逐条显示。
  const oScoped = (official && official.scoped) ||
    (official && official.opus ? [Object.assign({ name: "Opus" }, official.opus)] : []);

  // —— 主条(会话 / 本月):官方优先,否则回退 ccusage —— //
  let mainTag, mainPct, mainResetISO, mainElapsed, mainOk;
  if (oSession) {
    const wh = oSession.windowHours || SESSION_HOURS;
    mainTag = wh <= 24 ? "会话" : "本周期";
    mainPct = Math.round(oSession.pct);
    mainResetISO = oSession.resetISO;
    mainElapsed = periodElapsed(oSession.resetISO, wh);
    mainOk = true;
  } else if (isClaude) {
    mainTag = "会话"; mainPct = usedPct; mainResetISO = prov.resetISO;
    mainElapsed = periodElapsed(prov.resetISO, SESSION_HOURS); mainOk = prov.ok;
  } else {
    mainTag = "本月"; mainPct = usedPct; mainResetISO = prov.resetISO;
    mainElapsed = monthElapsed(); mainOk = prov.ok;
  }
  const mainColor = accent(mainPct / 100);
  const mainOnPace = mainPct / 100 <= mainElapsed + 0.02;

  // —— 每周条:官方优先,否则本周一锚点累计 vs 配置周额度 —— //
  const wk = (prov.stats && prov.stats.week) || null;
  const weekLim = wk ? (useTok ? wk.limit_tokens : wk.limit_cost) || 0 : 0;
  let weekShow = false, weekPct = 0, weekResetISO = "", weekElapsed = 0;
  if (oWeek) {
    weekShow = true; weekPct = Math.round(oWeek.pct); weekResetISO = oWeek.resetISO;
    weekElapsed = periodElapsed(oWeek.resetISO, oWeek.windowHours || WEEK_HOURS);
  } else if (weekLim > 0) {
    const wr = weekReset();
    let weekUsed = 0;
    series.forEach((d) => {
      if (new Date(d.date + "T00:00:00") >= wr.monday) weekUsed += (useTok ? d.tokens : d.cost) || 0;
    });
    weekShow = true; weekPct = Math.round(Math.min(weekUsed / weekLim, 1) * 100);
    weekResetISO = wr.resetISO; weekElapsed = periodElapsed(wr.resetISO, WEEK_HOURS);
  }
  const weekOnPace = weekPct / 100 <= weekElapsed + 0.02;

  // —— 模型维度「每周」条(现为 Fable,旧版 Opus;仅官方且非空,目前仅 Claude)—— //
  // 用量为 0(四舍五入后 0%)的模型不显示,避免长期挂一条空条。
  const scopedRows = oScoped
    .map((s) => {
      const pct = Math.round(s.pct);
      const elapsed = periodElapsed(s.resetISO, s.windowHours || WEEK_HOURS);
      return {
        name: s.name, pct, elapsed, resetISO: s.resetISO,
        onPace: pct / 100 <= elapsed + 0.02,
      };
    })
    .filter((s) => s.pct > 0);

  const maxV = Math.max(1, ...series.map((d) => (useTok ? d.tokens : d.cost)));
  const dayLim = useTok
    ? (prov.stats && prov.stats.today && prov.stats.today.limit_tokens) || 0
    : (prov.stats && prov.stats.today && prov.stats.today.limit_cost) || 0;
  const total30 = series.reduce((s, d) => s + (d.cost || 0), 0);
  const heatSeries = (prov.heat && prov.heat.length) ? prov.heat : series; // 热力图:近一年
  const heatOpacity = makeHeatScale(heatSeries, useTok);
  const heatCols = buildHeatmap(heatSeries, useTok);
  const heatWd = ["", "一", "", "三", "", "五", ""]; // 左侧仅标 一/三/五,对齐 GitHub
  return (
    <div className="card">
      <div className="ctop">
        <Logo />
        <div className="cnames">
          <span className="name">{prov.label}</span>
          {prov.account ? (
            <span
              className={"acct" + (prov.accountUrl ? " link" : "")}
              title={prov.accountUrl ? "打开账户页 · " + prov.account : prov.account}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); openExternal(prov.accountUrl); }}
            >
              {prov.account}
            </span>
          ) : null}
        </div>
        <span className="badge" style={{ background: brand }}>{prov.plan || prov.unit || "用量"}</span>
      </div>
      {!official && (
        <div className="mid">
          <span className="num">{Number(prov.used || 0)}</span>
          <span className="unit">/ {Number(prov.limit || 0)} {prov.unit}</span>
          <span className="pct" style={{ color: mainColor }}>{mainPct}%</span>
        </div>
      )}
      <ProgRow
        tag={mainTag} pct={mainPct} color={mainColor} elapsed={mainElapsed}
        onPace={mainOnPace} resetISO={mainResetISO} ok={mainOk} error={prov.error}
      />
      {weekShow && (
        <ProgRow
          tag="每周" pct={weekPct} color={accent(weekPct / 100)} elapsed={weekElapsed}
          onPace={weekOnPace} resetISO={weekResetISO} ok={true}
        />
      )}
      {scopedRows.map((s) => (
        <ProgRow
          key={s.name}
          tag={"每周 " + s.name} pct={s.pct} color={accent(s.pct / 100)} elapsed={s.elapsed}
          onPace={s.onPace} resetISO={s.resetISO} ok={true}
        />
      ))}
      {prov.stats && (
        <div className="stats">
          {["today", "week", "month"].map((k) => {
            const tag = { today: "日", week: "周", month: "月" }[k];
            const v = prov.stats[k] || { tokens: 0, cost: 0 };
            const useTok = prov.unit === "Mtok";
            const used = useTok ? v.tokens : v.cost;
            const lim = useTok ? v.limit_tokens : v.limit_cost;
            const r = lim > 0 ? Math.min(used / lim, 1) : 0;
            const rem = Math.max((lim || 0) - used, 0);
            const usedStr = useTok ? fmtTok(v.tokens) : ("$" + v.cost);
            const limStr = useTok ? fmtTok(v.limit_tokens) : ("$" + v.limit_cost);
            const remStr = lim > 0 ? (useTok ? "剩 " + fmtTok(rem) : "剩 $" + rem.toFixed(0)) : "—";
            const col = accent(r);
            return (
              <div className="st" key={k}>
                <i>{tag}</i>
                <span className="sval">{usedStr}<em>/ {limStr}</em></span>
                <span className="spct" style={{ color: col }}>{lim > 0 ? Math.round(r * 100) + "%" : "—"}</span>
                <span className="smini">
                  <i className="sfill" style={fillStyle(r)} />
                  <i className="stick" style={{ left: "25%" }} />
                  <i className="stick" style={{ left: "50%" }} />
                  <i className="stick" style={{ left: "75%" }} />
                </span>
                <span className="srem">{remStr}</span>
              </div>
            );
          })}
        </div>
      )}
      {series.length > 0 && (
        <div className="chartblock">
          <div
            className="sthd"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => toggleChart(e, pid)}
          >
            <span>每日趋势 · {useTok ? "Mtok" : "USD"} · {series.length}天</span>
            <span className="arw">▸</span>
          </div>
          <div className="chartwrap" data-mode="bar" ref={(n) => initChart(n, pid)}>
            <div className="chartmode" onMouseDown={(e) => e.stopPropagation()}>
              <button className="cmbtn" data-m="bar" onClick={(e) => setChartMode(e, pid, "bar")}>柱状</button>
              <button className="cmbtn" data-m="heat" onClick={(e) => setChartMode(e, pid, "heat")}>热力</button>
            </div>
            <div className="chartscroll">
              <div className="chartbars">
                {series.map((d) => {
                  const val = useTok ? d.tokens : d.cost;
                  const h = (val / maxV) * 100;
                  const valStr = useTok ? fmtTok(val) : "$" + val.toFixed(1);
                  return (
                    <div
                      className="cbar"
                      key={d.date}
                      title={d.date.slice(5) + "  " + valStr}
                      onMouseEnter={(e) =>
                        showDetail(e.currentTarget.closest(".chartblock").querySelector(".cdetail"), d, brand, true)
                      }
                    >
                      <i style={{ height: Math.max(h, 0) + "%", ...barFill(val, dayLim) }} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="heatwrap">
              <div className="heatscroll">
                <div className="heatgrid">
                  <div className="heatbody">
                    <div className="heatdays">
                      {heatWd.map((w, i) => <span key={i}>{w}</span>)}
                    </div>
                    <div className="heatcols">
                      {heatCols.map((col, ci) => (
                        <div className="heatcol" key={ci}>
                          {col.cells.map((c, wd) => {
                            if (!c) return <i className="hcell" key={wd} />;
                            const op = heatOpacity(c.val);
                            // 有日期的格子(含 0 用量)悬停都有描边框 + 提示,同 GitHub
                            const valStr = useTok ? fmtTok(c.val) : "$" + c.val.toFixed(1);
                            return (
                              <i
                                className="hcell on"
                                key={wd}
                                style={op != null ? { background: brand, opacity: op } : undefined}
                                title={c.date.slice(5) + "  " + valStr}
                                onMouseEnter={(e) =>
                                  showDetail(e.currentTarget.closest(".chartblock").querySelector(".cdetail"), c.day, brand, true)
                                }
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="heatmonths">
                    <span className="hmspace" />
                    {heatCols.map((col, i) => <span className="hmlabel" key={i}>{col.label}</span>)}
                  </div>
                </div>
              </div>
            </div>
            <div className="chartcap">
              <span>{fmtDate(series[0].date)}</span>
              <span>{fmtDate(series[series.length - 1].date)}</span>
            </div>
            <div className="cdetail" ref={(n) => initDetail(n, series, brand)}>
              <div className="cdhd" />
              <div className="cdmodels" />
            </div>
            <div className="cdtotal">
              估算总计 (近 {series.length} 天)：<b>${total30.toFixed(2)}</b>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 刷新按钮:转到「新数据真正到达」才停,不是播完一段固定动画就停。
// window.__aiRefresh 桥接「点击那一刻」和「下一次 render 拿到新数据」两个时间点
// (DOM 节点在两次 render 之间是复用的,见 initWrap 的 __dragInit 同款持久化写法)。
function markRefreshDone() {
  if (typeof window === "undefined") return;
  const st = window.__aiRefresh;
  if (!st || !st.pending) return;
  st.pending = false;
  if (st.timer) { clearTimeout(st.timer); st.timer = null; }
  if (st.btn) st.btn.classList.remove("spin");
}

// ---------- 主渲染 ----------
export const render = ({ output }) => {
  if (!output || !output.trim()) {
    return <div className="loading">AI USAGE · 读取中…</div>;
  }
  let data;
  try {
    data = JSON.parse(output);
  } catch (e) {
    return <div className="loading">解析失败：{String(output).slice(0, 160)}</div>;
  }
  if (data.fatal) {
    return <div className="loading">脚本错误：{data.fatal}</div>;
  }

  // 脚本重跑一次,ts 就会变;跟点击时记的 ts0 不一样即视为刷新成功,摘掉转圈。
  if (typeof window !== "undefined" && window.__aiRefresh &&
      window.__aiRefresh.pending && data.ts !== window.__aiRefresh.ts0) {
    markRefreshDone();
  }

  const onRefresh = (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    if (typeof window !== "undefined") {
      if (window.__aiRefresh && window.__aiRefresh.timer) clearTimeout(window.__aiRefresh.timer);
      window.__aiRefresh = { pending: true, ts0: data.ts, btn };
      // 兜底:命令真失败时(网络断/脚本报错反复)也别转到天荒地老,强制停转。
      // 正常刷新实测约 20s,但网络/npx 解析耗时会波动,45s 留足余量,避免正常刷新被误判成"超时"。
      window.__aiRefresh.timer = setTimeout(markRefreshDone, 45000);
    }
    btn.classList.remove("spin");
    void btn.offsetWidth; // 强制重启动画
    btn.classList.add("spin");
    // 时间不在这里乐观更新——.sub 的 ref 每次 render 都会用 data.date/asOf/ts 重设,
    // 脚本真跑完、拿到新数据时才会显示新时间;刷新失败/超时则维持上一次成功的时间。
    if (typeof run === "function") {
      run("osascript -e 'tell application \"Übersicht\" to refresh'").catch(() => {});
    }
  };

  return (
    <div className="wrap" ref={initWrap}>
      <div className="head">
        <div>
          <div className="tag">AI USAGE</div>
          <div className="sub" ref={(el) => setSub(el, data.date, data.asOf, data.ts)}></div>
        </div>
        <div className="decor">
          <div className="tri" />
          <div className="sq" />
          <button
            className="rfbtn"
            title="刷新"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onRefresh}
          >↻</button>
        </div>
      </div>
      <Card prov={data.claude} brand={C.claude} Logo={ClaudeLogo} pid="claude" />
      <Card prov={data.chatgpt} brand={C.gpt} Logo={GptLogo} pid="chatgpt" />
    </div>
  );
};
