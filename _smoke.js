/* ============================================================
 * 冒烟测试：线路规划平台 v5（仓库文件为真源）
 * 阶段 A：无 Token 只读回归（file://，画廊/懒加载/编辑器可用，保存与删除被拦截）
 * 阶段 B：页面内 mock fetch 模拟 GitHub 仓库（保存/编辑/删除/远端刷新/旧路线迁移），
 *         校验 PUT/DELETE 载荷与 catalog 重建，完全不接触真实网络
 * 用法：node _smoke.js
 * ============================================================ */
const puppeteer = require("C:/Users/Mickey/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core");
const path = require("path");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = "file:///" + path.resolve(__dirname, "线路规划平台.html").replace(/\\/g, "/");

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1440,900", "--lang=zh-CN"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const realErr = () => errors.filter(e => !/Failed to load resource|net::|ERR_|leaflet/i.test(e));

  let step = 0, fail = 0;
  const ok = (c, n) => { step++; if (c) console.log("  \u2713 [" + step + "] " + n); else { fail++; console.log("  \u2717 [" + step + "] " + n); } };
  async function ev(fn, ...args) { return page.evaluate(fn, ...args); }

  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await wait(2500);
  await ev(() => { window.__uh = []; window.addEventListener("unhandledrejection", e => window.__uh.push(String((e.reason && e.reason.message) || e.reason))); });

  /* ================= 阶段 A：无 Token 只读 ================= */
  console.log("\n== 阶段 A：无 Token 只读回归 ==");

  // A1. 主页画廊：cx/yl 两卡、无徽章、目录已注册、数据未预载
  const home = await ev(() => ({
    shown: getComputedStyle(document.getElementById("homeMask")).display !== "none",
    cards: [...document.querySelectorAll(".home-card")].map(e => e.getAttribute("data-route")),
    badges: document.querySelectorAll(".home-card .badge").length,
    cat: ROUTE_CATALOG.map(c => c.id).join(","),
    packs: Object.keys(ROUTE_PACKS).length,
    rendered: !!(window.currentGroup && currentGroup.getLayers().length)
  }));
  ok(home.shown && home.cards.join(",") === "cx,yl" && home.badges === 0, "画廊 2 卡无徽章 -> " + home.cards.join(","));
  ok(home.cat === "cx,yl" && home.packs === 0 && !home.rendered, "目录已注册且数据未预载 -> " + JSON.stringify(home));

  // A2. 侧栏：工具区 + 每条路线统一 ✏️📋🗑️
  const sb = await ev(() => ({
    tools: [...document.querySelectorAll(".rs-tools button")].map(b => b.textContent.trim()),
    rows: [...document.querySelectorAll(".route-switch .rs-btn")].map(b => ({
      id: b.getAttribute("data-route"),
      ops: [...b.querySelectorAll(".op")].map(o => o.getAttribute("data-act")).join(",")
    })),
    credit: document.querySelector(".rs-credit").textContent
  }));
  ok(sb.tools.length === 3 && /新建路线|设置|刷新/.test(sb.tools.join("|")), "侧栏工具区齐全 -> " + sb.tools.join("|"));
  ok(sb.rows.length === 2 && sb.rows.every(r => r.ops === "edit,dup,del"), "每条路线统一操作 -> " + JSON.stringify(sb.rows.map(r => r.id + ":" + r.ops)));
  ok(/GitHub/.test(sb.credit), "侧栏注明仓库真源");

  // A3. 点川西卡 -> 懒加载 routes/cx.js 渲染 11 点
  await ev(() => document.querySelector('.home-card[data-route="cx"]').click());
  await page.waitForFunction(() => document.querySelectorAll("#wpList .wp-item").length === 11, { timeout: 10000 }).catch(() => {});
  const cx = await ev(() => ({ wp: document.querySelectorAll("#wpList .wp-item").length, stops: ROUTE_PACKS.cx ? ROUTE_PACKS.cx.stops.length : -1 }));
  ok(cx.wp === 11 && cx.stops === 11, "点川西卡渲染 11 点 -> " + JSON.stringify(cx));

  // A4. ✏️ 编辑川西：弹窗内 11 点
  await ev(() => document.querySelector('.route-switch .rs-btn[data-route="cx"] .op[data-act="edit"]').click());
  await page.waitForFunction(() => document.getElementById("editorMask").classList.contains("open"), { timeout: 5000 }).catch(() => {});
  await wait(300);
  const edCx = await ev(() => ({ open: document.getElementById("editorMask").classList.contains("open"), rows: document.querySelectorAll("#edStops .ed-stop").length, ttl: document.getElementById("edTitle").textContent }));
  ok(edCx.open && edCx.rows === 11 && /编辑/.test(edCx.ttl), "✏️ 川西 → 编辑弹窗 11 点 -> " + JSON.stringify(edCx));
  await ev(() => closeEditor());
  await wait(250);

  // A5. 📋 复制伊犁（数据未加载，触发 ensureRouteData 懒加载）
  await ev(() => document.querySelector('.route-switch .rs-btn[data-route="yl"] .op[data-act="dup"]').click());
  await page.waitForFunction(() => document.getElementById("editorMask").classList.contains("open") && document.querySelectorAll("#edStops .ed-stop").length === 21, { timeout: 10000 }).catch(() => {});
  const dupYl = await ev(() => ({ rows: document.querySelectorAll("#edStops .ed-stop").length, nm: document.getElementById("edName").value, loaded: !!ROUTE_PACKS.yl }));
  ok(dupYl.rows === 21 && dupYl.loaded && /副本/.test(dupYl.nm), "📋 复制伊犁懒加载 21 点 -> " + JSON.stringify(dupYl));
  await ev(() => closeEditor());
  await wait(250);

  // A6. 新建 + 加站，无 Token 保存被拦截（编辑器保持打开，不写任何本地路线）
  await ev(() => openNewEditor());
  await wait(250);
  await page.type("#edSearch", "44.49427, 81.15873");
  await ev(() => doSearch());
  await wait(400);
  const n1 = await ev(() => document.querySelectorAll("#edStops .ed-stop").length);
  ok(n1 === 1, "GPS 加站 1 点");
  await page.type("#edName", "只读不保存线");
  await ev(() => document.getElementById("edSave").click());
  await wait(400);
  const blk = await ev(() => ({
    toast: document.getElementById("toast").textContent,
    edOpen: document.getElementById("editorMask").classList.contains("open"),
    setOpen: document.getElementById("settingsMask").classList.contains("open"),
    storeN: (JSON.parse(localStorage.getItem("route-platform:v1") || "{}").routes || []).length,
    catN: ROUTE_CATALOG.length
  }));
  ok(blk.edOpen && /Token/.test(blk.toast) && blk.setOpen && blk.storeN === 0 && blk.catN === 2,
    "无 Token 保存被拦截（弹设置）且零落盘 -> " + JSON.stringify(blk));
  await ev(() => { document.getElementById("settingsClose").click(); closeEditor(); });
  await wait(250);

  // A7. 无 Token 删除被拦截（二次确认后报错、目录不变）
  await ev(() => { deleteRouteAsk("cx"); deleteRouteAsk("cx"); });
  await wait(300);
  const delBlk = await ev(() => ({ toast: document.getElementById("toast").textContent, catN: ROUTE_CATALOG.length, hasCx: !!ROUTE_PACKS.cx }));
  ok(/Token/.test(delBlk.toast) && delBlk.catN === 2 && delBlk.hasCx, "无 Token 删除被拦截、目录不变 -> " + JSON.stringify(delBlk));

  /* ================= 阶段 B：mock fetch 仓库写入 ================= */
  console.log("\n== 阶段 B：mock fetch 仓库写入（零真实网络）==");

  // B1. 安装仓库 mock + 注入 Token
  await ev(() => {
    window.__ghLog = [];
    window.__ghFiles = {};
    window.__ghSeed = function (p, text) { window.__ghFiles[p] = { text: text, sha: "s" + Object.keys(window.__ghFiles).length }; };
    window.__ghSeed("routes/catalog.js", catalogFileText()); // 远端初始目录 = 当前(川西+伊犁)
    const orig = window.fetch.bind(window);
    window.fetch = function (url, opt) {
      const u = String(url); opt = opt || {};
      const m = u.match(/api\.github\.com\/repos\/[^/]+\/[^/]+\/contents\/(.+?)(\?|$)/);
      if (m) {
        const p = decodeURIComponent(m[1]);
        const method = (opt.method || "GET").toUpperCase();
        if (method === "GET") {
          const f = window.__ghFiles[p];
          if (!f) return Promise.resolve({ status: 404, json: () => Promise.resolve({ message: "Not Found" }) });
          return Promise.resolve({ status: 200, json: () => Promise.resolve({ content: b64Text(f.text), sha: f.sha, name: p.split("/").pop() }) });
        }
        let body = {}; try { body = JSON.parse(opt.body || "{}"); } catch (e) {}
        if (method === "PUT") {
          const existed = !!window.__ghFiles[p];
          const text = decodeContent(body.content || "");
          window.__ghFiles[p] = { text: text, sha: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) };
          window.__ghLog.push({ method: "PUT", path: p, msg: body.message || "", hadSha: !!body.sha, text: text });
          return Promise.resolve({ status: existed ? 200 : 201, json: () => Promise.resolve({ content: body.content, sha: window.__ghFiles[p].sha }) });
        }
        if (method === "DELETE") {
          delete window.__ghFiles[p];
          window.__ghLog.push({ method: "DELETE", path: p, msg: body.message || "" });
          return Promise.resolve({ status: 200, json: () => Promise.resolve({}) });
        }
      }
      if (/project-osrm\.org|restapi\.amap\.com/.test(u)) return Promise.reject(new Error("stub offline")); // 阻断外呼，防脏写
      return orig(u, opt);
    };
    store.gh = { repo: "Sunyh-gi/route-planner", branch: "main", token: "smoke-mock-token" };
    saveStore();
    return { en: ghEnabled(), tok: ghNeedToken() };
  }).then(r => { ok(r.en && r.tok, "注入仓库配置 + Token（ghEnabled=" + r.en + ", token=" + r.tok + "）"); });

  // B2. 保存新路线 -> PUT routes/<id>.js + PUT routes/catalog.js，载荷校验
  await ev(() => openNewEditor());
  await wait(250);
  await ev(() => { setDayNum(1); addStop("云端起点", 30.0, 102.0); setDayNum(2); addStop("云端终点", 30.2, 102.2); edCtx.preC = 5; edCtx.preTag = "☁️"; document.getElementById("edName").value = "云端测试线"; });
  await wait(200);
  await ev(() => document.getElementById("edSave").click());
  await page.waitForFunction(() => (window.__ghLog || []).filter(l => l.method === "PUT").length >= 2, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => !document.getElementById("editorMask").classList.contains("open"), { timeout: 8000 }).catch(() => {});
  await wait(400);
  const b2 = await ev(() => {
    const puts = window.__ghLog.filter(l => l.method === "PUT");
    const rPut = puts.find(l => l.path.indexOf("routes/") === 0 && l.path !== "routes/catalog.js");
    const cPut = puts.find(l => l.path === "routes/catalog.js");
    let rJson = null;
    if (rPut) {
      const t = rPut.text;
      const a = t.indexOf("]=");
      const b = t.indexOf(";})();");
      try { if (a >= 0 && b > a) rJson = JSON.parse(t.slice(a + 2, b)); } catch (e) {}
    }
    const id = rPut ? rPut.path.split("/").pop().replace(/\.js$/, "") : null;
    return {
      id: id, rMsg: rPut ? rPut.msg : "", cMsg: cPut ? cPut.msg : "",
      catHasNew: cPut ? cPut.text.indexOf("云端测试线") >= 0 : false,
      catHasCx: cPut ? cPut.text.indexOf('"id":"cx"') >= 0 : false,
      catHasYl: cPut ? cPut.text.indexOf('"id":"yl"') >= 0 : false,
      rName: rJson ? rJson.name : "", rN: rJson ? (rJson.stops || []).length : -1,
      localCat: ROUTE_CATALOG.map(c => c.id).join(","),
      localPacks: Object.keys(ROUTE_PACKS).filter(k => k.indexOf("__pv") < 0).join(","),
      rows: document.querySelectorAll(".route-switch .rs-btn").length,
      edOpen: document.getElementById("editorMask").classList.contains("open"),
      toast: document.getElementById("toast").textContent,
      uh: (window.__uh || []).slice()
    };
  });
  if (!(b2.rName === "云端测试线" && b2.rN === 2)) console.log("   [debug b2] " + JSON.stringify(b2));
  ok(!!b2.id && b2.rMsg === "route: save 云端测试线" && b2.rName === "云端测试线" && b2.rN === 2, "保存 PUT routes/" + b2.id + ".js 载荷正确 -> " + b2.rName + " n=" + b2.rN);
  ok(b2.cMsg === "route: catalog" && b2.catHasNew && b2.catHasCx && b2.catHasYl, "catalog PUT 含 川西+伊犁+新线");
  ok(b2.localCat.indexOf(b2.id) >= 0 && b2.localPacks.indexOf(b2.id) >= 0 && b2.rows === 3 && !b2.edOpen && /已保存/.test(b2.toast), "运行时目录/数据/侧栏同步且弹窗关闭 -> " + JSON.stringify(b2));

  // B3. 编辑并改名保存 -> 同文件带 sha 覆盖，catalog 更新不重复
  await page.waitForFunction(() => (window.__ghLog || []).length >= 2, { timeout: 8000 }).catch(() => {});
  const id = b2.id;
  await ev((rid) => openEditFor(rid), id);
  await page.waitForFunction(() => document.getElementById("editorMask").classList.contains("open") && document.querySelectorAll("#edStops .ed-stop").length === 2, { timeout: 6000 }).catch(() => {});
  await wait(250);
  const b3 = await ev((rid) => {
    document.getElementById("edName").value = "云端测试线·改";
    document.getElementById("edSave").click();
    return rid;
  }, id);
  await page.waitForFunction((rid) => (window.__ghLog || []).filter(l => l.method === "PUT" && l.path === "routes/" + rid + ".js").length >= 2, { timeout: 8000 }, id).catch(() => {});
  await wait(300);
  const b3r = await ev((rid) => {
    const puts = window.__ghLog.filter(l => l.method === "PUT");
    const rPut = puts.filter(l => l.path === "routes/" + rid + ".js");
    const cPut = puts.filter(l => l.path === "routes/catalog.js").pop();
    return { hadSha: rPut[rPut.length - 1].hadSha, catTxt: cPut ? cPut.text : "" };
  }, id);
  ok(b3r.hadSha, "编辑保存带 sha 覆盖（先读后写）");
  const b3chk = await ev((rid) => {
    const c = ROUTE_CATALOG.filter(x => x.id === rid);
    return { n: ROUTE_CATALOG.length, name: c.length ? c[0].name : "", nm: ROUTE_PACKS[rid] ? ROUTE_PACKS[rid].name : "" };
  }, id);
  ok(b3chk.n === 3 && b3chk.name === "云端测试线·改" && b3chk.nm === "云端测试线·改" && b3r.catTxt.indexOf("云端测试线·改") >= 0 && b3r.catTxt.indexOf("云端测试线\"") < 0, "改名后目录与数据同步、无重复条目 -> " + JSON.stringify(b3chk));

  // B4. 删除 -> DELETE 路线文件 + catalog PUT（只留川西/伊犁）
  const preDelLogN = await ev(() => window.__ghLog.length);
  await ev((rid) => { deleteRouteAsk(rid); deleteRouteAsk(rid); }, id);
  await page.waitForFunction((rid) => (window.__ghLog || []).some(l => l.method === "DELETE" && l.path === "routes/" + rid + ".js"), { timeout: 8000 }, id).catch(() => {});
  await wait(400);
  const b4 = await ev((rid) => {
    const del = window.__ghLog.find(l => l.method === "DELETE" && l.path === "routes/" + rid + ".js");
    const cPut = window.__ghLog.filter(l => l.method === "PUT" && l.path === "routes/catalog.js").pop();
    return { delMsg: del ? del.msg : "", fileGone: !window.__ghFiles["routes/" + rid + ".js"], cat: ROUTE_CATALOG.map(c => c.id).join(","), hasPk: !!ROUTE_PACKS[rid], toast: document.getElementById("toast").textContent };
  }, id);
  ok(b4.delMsg === "route: delete 云端测试线·改" && b4.fileGone && b4.cat === "cx,yl" && !b4.hasPk && /已删除/.test(b4.toast), "删除后仓库文件移除、目录回 2 条 -> " + b4.cat);
  void preDelLogN;

  // B5. 远端刷新：远端 catalog 多一条未随站点发布的路线 -> 🔄 拉取
  await ev(() => {
    window.__ghSeed("routes/rem.js", routeFileText({ id: "rem", name: "远端拉取线", stops: [{ name: "远程A", lat: 31.0, lng: 103.0, day: 1, tag: "" }], segs: {} }));
    const cur = ROUTE_CATALOG.map(function (c) { return { id: c.id, name: c.name, file: c.file, days: c.days, n: c.n, color: c.color }; });
    cur.push({ id: "rem", name: "远端拉取线", file: "routes/rem.js", days: 1, n: 1, color: "#0D9488" });
    window.__ghFiles["routes/catalog.js"].text = "window.ROUTE_CATALOG=" + JSON.stringify(cur) + ";\nwindow.ROUTE_PLACES=" + JSON.stringify(window.ROUTE_PLACES || []) + ";\n";
    doRefresh();
  });
  await page.waitForFunction(() => (ROUTE_CATALOG || []).some(c => c.id === "rem"), { timeout: 8000 }).catch(() => {});
  await wait(300);
  const b5 = await ev(() => ({ cat: ROUTE_CATALOG.map(c => c.id).join(","), remStops: ROUTE_PACKS.rem ? ROUTE_PACKS.rem.stops.length : -1, toast: document.getElementById("toast").textContent }));
  ok(b5.cat.indexOf("rem") >= 0 && b5.remStops === 1 && /刷新完成/.test(b5.toast), "远端刷新拉取新路线 rem -> " + JSON.stringify(b5));

  // B6. 迁移旧路线：localStorage 遗留 -> 逐条 PUT + catalog 更新 + 清空旧库
  await ev(() => {
    store.routes = [{ id: "legacy-smoke", name: "旧版遗留线", stops: [{ name: "旧点A", lat: 30.1, lng: 102.1, day: 1, tag: "" }, { name: "旧点B", lat: 30.2, lng: 102.2, day: 2, tag: "" }], segs: {}, preset: { c: 2, tag: "旧" } }];
    saveStore();
    migrateLegacy();
  });
  await page.waitForFunction(() => (window.__ghLog || []).some(l => l.method === "PUT" && l.path === "routes/legacy-smoke.js"), { timeout: 8000 }).catch(() => {});
  await wait(400);
  const b6 = await ev(() => {
    const puts = window.__ghLog.filter(l => l.method === "PUT");
    const lPut = puts.find(l => l.path === "routes/legacy-smoke.js");
    const cPut = puts.filter(l => l.path === "routes/catalog.js").pop();
    return { lMsg: lPut ? lPut.msg : "", catHasLegacy: cPut ? cPut.text.indexOf("legacy-smoke") >= 0 : false, catN: ROUTE_CATALOG.length, legacyN: legacyRoutes().length, toast: document.getElementById("toast").textContent };
  });
  ok(b6.lMsg === "route: migrate 旧版遗留线" && b6.catHasLegacy && b6.catN === 4 && b6.legacyN === 0 && /迁移完成/.test(b6.toast), "旧路线迁移入库并清空本地 -> cat=" + b6.catN);

  // B7. 主页画廊 4 卡（含新路线与标签），截屏
  await ev(() => showHome());
  await wait(400);
  const cards = await ev(() => [...document.querySelectorAll(".home-card")].map(c => c.querySelector(".nm").textContent.trim()));
  ok(cards.length === 4 && cards.some(t => t.indexOf("旧版遗留线") >= 0), "主页画廊 4 卡 -> " + JSON.stringify(cards));
  await page.screenshot({ path: path.join(__dirname, "_shot_platform.png") });

  /* ================= 汇总 ================= */
  const real = realErr();
  console.log("\n== 控制台错误(" + errors.length + " 条，非网络 " + real.length + " 条) ==");
  real.slice(0, 8).forEach(e => console.log("   " + e.slice(0, 200)));
  console.log("\n通过 " + (step - fail) + "/" + step + (fail ? "  \u26a0 失败 " + fail + " 项" : " \u2713 全部通过"));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("SMOKE CRASH:", e); process.exit(2); });
