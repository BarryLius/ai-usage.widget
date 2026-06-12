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

// 用 DOM 直接填充明细(Übersicht 的 render 不走 hooks,悬停状态用 DOM 维护)
function showDetail(panel, day, brand) {
  if (!panel || !day) return;
  const head = panel.querySelector(".cdhd");
  if (head) {
    head.textContent =
      fmtDate(day.date) + ": $" + Number(day.cost || 0).toFixed(2) +
      " · " + fmtTok(day.tokens || 0) + " tokens";
  }
  const box = panel.querySelector(".cdmodels");
  if (!box) return;
  box.textContent = "";
  const models = day.models || [];
  if (!models.length) {
    const e = document.createElement("div");
    e.className = "cdempty";
    e.textContent = "无模型明细";
    box.appendChild(e);
    return;
  }
  models.forEach((m) => {
    const row = document.createElement("div");
    row.className = "cdrow";
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
}

// 默认展示最近一个有用量的日子
function initDetail(node, series, brand) {
  if (!node || !series || !series.length) return;
  let day = null;
  for (let i = series.length - 1; i >= 0; i--) {
    if ((series[i].cost || 0) > 0) { day = series[i]; break; }
  }
  showDetail(node, day || series[series.length - 1], brand);
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
  if (open) {
    const sc = chart.querySelector(".chartscroll");
    if (sc) requestAnimationFrame(() => { sc.scrollLeft = sc.scrollWidth; });
  }
}

function initChart(node, pid) {
  if (!node) return;
  let open = false;
  try { open = localStorage.getItem("ai-usage-chart-" + pid) === "1"; } catch (e) {}
  const card = node.closest(".card");
  const head = card && card.querySelector(".sthd");
  if (open) {
    node.classList.add("open");
    if (head) head.classList.add("open");
  }

  const sc = node.querySelector(".chartscroll");
  if (sc) {
    requestAnimationFrame(() => { if (open) sc.scrollLeft = sc.scrollWidth; });
    if (!sc.__dragInit) {
      sc.__dragInit = true;
      sc.addEventListener("mousedown", (e) => {
        e.stopPropagation();          // 不触发整窗拖动
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
  }
}

// ---------- 根样式 ----------
export const className = `
  top: 0; left: 0;
  font-family: 'Futura', 'Helvetica Neue', -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;

  /* 主题变量:浅色默认,夜间模式由系统 prefers-color-scheme 覆盖。
     强调色(橙/绿/红/黄/蓝)两种模式通用,不放进变量。 */
  --paper: #F2EDE2; --card: #FFFFFF; --ink: #111111; --muted: #9A9A9A;
  --track: #F2EDE2; --barframe: #111111; --tick: #111111; --tickmini: rgba(0,0,0,0.25);
  --line: rgba(0,0,0,0.10); --hover: rgba(0,0,0,0.08); --scroll: rgba(0,0,0,0.18);
  --shadow: rgba(0,0,0,0.18);
  color: var(--ink);

  @media (prefers-color-scheme: dark) {
    --paper: #1C1C1E; --card: #2C2C2E; --ink: #F5F5F7; --muted: #8E8E93;
    --track: #3A3A3C; --barframe: rgba(255,255,255,0.12); --tick: #F5F5F7; --tickmini: rgba(255,255,255,0.28);
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
  .rfbtn.spin { animation: rfspin .6s linear; }
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

  .bar { height: 20px; background: var(--barframe); border-radius: 10px; padding: 3px; box-sizing: border-box; }
  .track { position: relative; height: 100%; background: var(--track); border-radius: 7px; overflow: hidden; }
  .fill { position: absolute; left: 0; top: 0; height: 100%; border-radius: 7px; transition: width .4s ease; }
  .tick { position: absolute; top: 2px; bottom: 2px; width: 2px; background: var(--tick); opacity: .9; }

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

  /* 每日柱状图:外层折叠,内层横向拖动滚动 */
  .chartwrap { max-height: 0; overflow: hidden; transition: max-height .35s ease; }
  .chartwrap.open { max-height: 420px; margin-top: 6px; }
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

// ---------- 服务卡片 ----------
const Card = ({ prov, brand, Logo, pid }) => {
  const ratio = Math.min(prov.ratio || 0, 1);
  const a = accent(ratio);
  const rt = resetText(prov.resetISO);
  const useTok = prov.unit === "Mtok";
  const series = prov.series || [];
  const maxV = Math.max(1, ...series.map((d) => (useTok ? d.tokens : d.cost)));
  const dayLim = useTok
    ? (prov.stats && prov.stats.today && prov.stats.today.limit_tokens) || 0
    : (prov.stats && prov.stats.today && prov.stats.today.limit_cost) || 0;
  const total30 = series.reduce((s, d) => s + (d.cost || 0), 0);
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
      <div className="mid">
        <span className="num">{Number(prov.used || 0)}</span>
        <span className="unit">/ {Number(prov.limit || 0)} {prov.unit}</span>
        <span className="pct" style={{ color: a }}>{Math.round(ratio * 100)}%</span>
      </div>
      <div className="bar">
        <div className="track">
          <div className="fill" style={fillStyle(ratio)} />
          <i className="tick" style={{ left: "25%" }} />
          <i className="tick" style={{ left: "50%" }} />
          <i className="tick" style={{ left: "75%" }} />
        </div>
      </div>
      {prov.ok
        ? <div className="foot">
            {rt || "本周期用量"}
            {prov.alt ? " · " + prov.alt.used + " " + prov.alt.unit : ""}
          </div>
        : <div className="foot err">⚠ {prov.error || "无数据"}</div>}
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
          <div className="chartwrap" ref={(n) => initChart(n, pid)}>
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
                        showDetail(e.currentTarget.closest(".chartblock").querySelector(".cdetail"), d, brand)
                      }
                    >
                      <i style={{ height: Math.max(h, 0) + "%", ...barFill(val, dayLim) }} />
                    </div>
                  );
                })}
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

  const onRefresh = (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    btn.classList.remove("spin");
    void btn.offsetWidth; // 强制重启动画
    btn.classList.add("spin");
    // 立即更新时间(整体刷新需等脚本跑完,先让时间即时生效)
    const wrap = btn.closest(".wrap");
    if (wrap) {
      const d = new Date();
      const hhmm = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
      const md = (d.getMonth() + 1) + "月" + d.getDate() + "日";
      setSub(wrap.querySelector(".sub"), md, hhmm, Math.floor(Date.now() / 1000));
    }
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
