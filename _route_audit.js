/* ============================================================
 * 路线数据静态审计（项目常驻工具，随 _smoke.js 一起保留）
 *
 * 为什么需要它：路线数据是手写 JSON，其中「出行方式」p 字段无法在界面里设置，
 * 只能手改 routes/*.js。历史上正因如此出过「步行/骑马虚线不显示」的 bug —— 数据
 * 没问题时它却是被同色实线盖住；数据写错时（p 拼错、漏 poly）更是静默失效。
 * 这个脚本把两类问题一次查清，适合「新增路线后」「改动 routes/ 后」跑一遍。
 *
 * 查三类：
 *   A. 数据完整性：p 取值合法性 / poly 是否存在 / 站点坐标与 day
 *   B. 几何隐患：段端点离图钉过远（线接不上）/ 疑似直线占位
 *   C. 重叠遮挡：段与段折线高度重合（这是「被盖住」的结构性成因，需人工判断是否真被盖）
 *
 * 用法：node _route_audit.js            （全量）
 *       node _route_audit.js --strict   （有问题则 exit 1，可接 CI）
 * ============================================================ */
const fs = require("fs"), path = require("path");
const HERE = __dirname;

const win = { ROUTE_PACKS: {}, ROUTE_CATALOG: [] };
global.window = win;
const files = fs.readdirSync(path.join(HERE, "routes")).filter(f => /\.js$/.test(f));
for (const f of files) {
  try { eval(fs.readFileSync(path.join(HERE, "routes", f), "utf8")); }
  catch (e) { console.error("!! 无法解析 routes/" + f + " : " + e.message); }
}
const FOOT_MODES = { foot: 1, cycling: 1 };
const CAT = win.ROUTE_CATALOG || [];
const PACKS = win.ROUTE_PACKS || {};

// ---- 几何工具 ----
const R = 6371000, rad = d => d * Math.PI / 180;
function dist(a, b) {
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function minDistToPoly(p, poly) {
  let m = Infinity;
  for (const q of poly) { const d = dist(p, q); if (d < m) m = d; if (m < 1) break; }
  return m;
}
const segKey = (a, b) => a.lat.toFixed(5) + "," + a.lng.toFixed(5) + "|" + b.lat.toFixed(5) + "," + b.lng.toFixed(5);
const BRIDGE_MIN = 200;   // 与页面 bridgeEnds 阈值一致（判「线接不上图钉」，页面会自动补端点，故仅提示）
const SAME_ROAD = 30;     // 折线点距 ≤ 30m 视为同一条路
const DUP_PTS = 8;        // 少于此点数的 poly 视为「过短」

let totalIssues = 0;
const summary = [];

for (const id of Object.keys(PACKS)) {
  const r = PACKS[id], stops = r.stops || [], segs = r.segs || {};
  const hard = [], soft = [], geom = [];

  // A. 数据完整性
  if (!stops.length) hard.push("路线无站点数据");
  stops.forEach((s, i) => {
    if (typeof s.lat !== "number" || typeof s.lng !== "number" || isNaN(s.lat) || isNaN(s.lng)) hard.push(`站点${i + 1}「${s.name || "?"}」坐标非法`);
    if (typeof s.day !== "number" || s.day < 1) hard.push(`站点${i + 1}「${s.name || "?"}」缺少合法 day`);
  });
  let footFil = 0;
  for (const k in segs) {
    if (!segs.hasOwnProperty(k)) continue;
    const c = segs[k], tag = k.split("|").join(" → ");
    if (c && c.p != null && !FOOT_MODES[c.p]) hard.push(`段「${tag}」p="${c.p}" 非法（只认 ${Object.keys(FOOT_MODES).join(" / ")}）→ 会按驾车实线渲染，虚线消失`);
    if (c && FOOT_MODES[c.p]) footFil++;
    if (!c || !c.poly || !c.poly.length) hard.push(`段「${tag}」缺 poly 或为空 → 渲染时按直线占位`);
    else if (c.poly.length < DUP_PTS && c.d > 3000) soft.push(`段「${tag}」仅 ${c.poly.length} 点却有 ${(c.d / 1000).toFixed(1)}km → 疑似直线占位`);
  }
  if (stops.length >= 2 && Object.keys(segs).length === 0) hard.push("整条路线无任何段数据（文件可能被截断）");

  // B/C. 几何与重叠
  const ordered = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1], c = segs[segKey(a, b)];
    ordered.push({ i, a, b, c });
    if (!c || !c.poly || !c.poly.length) continue;
    const gA = dist([a.lat, a.lng], c.poly[0]), gB = dist([b.lat, b.lng], c.poly[c.poly.length - 1]);
    if (gA > BRIDGE_MIN || gB > BRIDGE_MIN)
      soft.push(`段${i}「${a.name}→${b.name}」端点离图钉 ${Math.round(gA)}m / ${Math.round(gB)}m（页面已自动补端点接驳，仅记录）`);
  }
  for (let i = 0; i < ordered.length; i++) {
    const A = ordered[i];
    if (!A.c || !A.c.poly || !A.c.poly.length) continue;
    for (let j = 0; j < ordered.length; j++) {
      if (i === j) continue;
      const B = ordered[j];
      if (!B.c || !B.c.poly || !B.c.poly.length) continue;
      let hit = 0;
      for (const p of A.c.poly) if (minDistToPoly(p, B.c.poly) <= SAME_ROAD) hit++;
      if (hit / A.c.poly.length >= 0.9) {
        const hidden = ordered[i], cover = ordered[j];
        const sameColor = hidden.b.day === cover.b.day;
        const hiddenMode = hidden.c.p || "drive", coverMode = cover.c.p || "drive";
        // 后画者盖住先画者：只有「先画的是脚力虚线」才真的丢信息（v6.20.2 已让虚线后画，故仅记录）
        const risky = i < j && FOOT_MODES[hiddenMode];
        soft.push(`段${i}「${hidden.a.name}→${hidden.b.name},${hiddenMode}」与段${j}「${cover.a.name}→${cover.b.name},${coverMode}」重合 ${(hit / A.c.poly.length * 100).toFixed(0)}%${sameColor ? "（同色）" : "（异色）"}${risky ? " ⚠ 脚力段在先，靠两趟绘制保证可见" : ""}`);
      }
    }
  }

  totalIssues += hard.length;
  summary.push({ id, name: r.name, stops: stops.length, segs: Object.keys(segs).length, foot: footFil, hard, soft });
  console.log("\n" + "=".repeat(74));
  console.log(`${r.name} (${id})  站点 ${stops.length}  段 ${Object.keys(segs).length}  脚力段 ${footFil}`);
  console.log("-".repeat(74));
  console.log(hard.length ? "【需修复】" : "【需修复】无");
  hard.forEach(x => console.log("  ✗ " + x));
  if (soft.length) { console.log("【提示】"); soft.forEach(x => console.log("  · " + x)); }
}

console.log("\n" + "=".repeat(74));
const footTotal = summary.reduce((n, r) => n + r.foot, 0);
console.log(`汇总：${summary.length} 条路线 · ${footTotal} 个脚力段（步行/骑马）· 需修复 ${totalIssues} 处`);
if (process.argv.includes("--strict") && totalIssues) process.exit(1);
