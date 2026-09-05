/* ============================================================
 * 冒烟测试：线路规划平台 v6.4（视图/编辑模式 + 新菜单 + 调色板种子洗牌）
 * 阶段 A：无 Token 只读回归（默认视图模式；点 ⋯ → 编辑路线进入编辑模式后验证搜索/卡片/加站）
 * 阶段 B：mock fetch 模拟 GitHub 仓库写入
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
  page.on("dialog", d => d.accept().catch(() => {}));
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
  await ev(() => {
    if (window.__osrmStubbed) return;
    const origFetch = window.fetch.bind(window);
    window.fetch = function (url, opt) {
      const u = String(url);
      if (/router\.project-osrm\.org|restapi\.amap\.com/.test(u)) return Promise.reject(new Error("osrm stub offline"));
      return origFetch(u, opt);
    };
    window.__osrmStubbed = true;
  });

  /* ================= 阶段 A：无 Token 只读 ================= */
  console.log("\n== 阶段 A：无 Token 只读回归 ==");

  // A1. 主页画廊：2 卡无徽章 + 侧栏显示"未选择路线" + 目录已注册
  const home = await ev(() => ({
    shown: getComputedStyle(document.getElementById("homeMask")).display !== "none",
    cards: [...document.querySelectorAll(".home-card")].map(e => e.getAttribute("data-route")),
    badges: document.querySelectorAll(".home-card .badge").length,
    cat: ROUTE_CATALOG.map(c => c.id).join(","),
    packs: Object.keys(ROUTE_PACKS).length,
    routeName: document.getElementById("routeName").textContent,
    tools: [...document.querySelectorAll(".home-tools button")].map(b => b.textContent.trim())
  }));
  ok(home.shown && home.cards.join(",") === "cx,yl" && home.badges === 0, "画廊 2 卡无徽章 -> " + home.cards.join(","));
  ok(home.cat === "cx,yl" && home.packs === 0, "目录已注册且数据未预载 -> " + JSON.stringify(home));
  ok(home.routeName === "未选择路线", "侧栏路线名=未选择路线");
  ok(home.tools.length === 3 && /新建路线/.test(home.tools[0]) && /设置/.test(home.tools[1]) && /刷新/.test(home.tools[2]), "首页工具 3 件套 → " + home.tools.join("|"));

  // A2. 点川西卡 → 进入视图模式（默认隐藏搜索/保存/编辑按钮）
  await ev(() => document.querySelector('.home-card[data-route="cx"]').click());
  await page.waitForFunction(() => document.querySelectorAll("#wpList .wp-item").length === 11, { timeout: 10000 }).catch(() => {});
  const cx = await ev(() => ({
    name: document.getElementById("routeName").textContent,
    wp: document.querySelectorAll("#wpList .wp-item").length,
    stops: ROUTE_PACKS.cx ? ROUTE_PACKS.cx.stops.length : -1,
    hasSaveBtn: !!document.getElementById("saveBtn"),
    hasSearch: !!document.getElementById("edSearch"),
    hasSearchGo: !!document.getElementById("edSearchBtn"),
    dirty: document.querySelector(".save-row").classList.contains("dirty"),
    editing: document.querySelector(".info-panel").classList.contains("editing"),
    editPillHidden: document.getElementById("editPill").hidden,
    searchRowVisible: getComputedStyle(document.querySelector(".route-edit-row")).display !== "none",
    saveRowVisible: getComputedStyle(document.querySelector(".save-row")).display !== "none",
    opsButtons: document.querySelectorAll("#wpList .wp-item .ops button").length,
    draggables: [...document.querySelectorAll('#wpList .wp-item')].filter(e => e.getAttribute("draggable") === "true").length,
    noDayStepper: !document.querySelector(".day-stepper"),
    noTools: document.querySelectorAll(".rs-tools").length === 0
  }));
  ok(cx.name === "川西路线" && cx.wp === 11 && cx.stops === 11, "点川西卡 → 侧栏 11 点 -> " + JSON.stringify(cx));
  ok(cx.hasSaveBtn && cx.hasSearch && cx.hasSearchGo && !cx.dirty && !cx.editing && cx.editPillHidden && !cx.searchRowVisible && !cx.saveRowVisible && cx.opsButtons === 0 && cx.draggables === 0 && cx.noDayStepper && cx.noTools, "默认视图模式：隐藏搜索/保存/编辑按钮/拖拽、无 day-stepper -> " + JSON.stringify(cx));

  // A2.5. 点 ⋯ → 编辑路线 → 进入编辑模式（搜索行/保存行/编辑按钮/拖拽全部恢复）
  await ev(() => document.getElementById("routeMenuBtn").click());
  await wait(150);
  const m1 = await ev(() => ({
    open: document.getElementById("routeMenuPop").classList.contains("open"),
    items: [...document.querySelectorAll("#routeMenuPop button")].map(b => b.textContent.trim()),
    editTxt: document.getElementById("routeMenuEdit").textContent.trim(),
    delVisible: getComputedStyle(document.getElementById("routeMenuDel")).display !== "none"
  }));
  ok(m1.open && m1.items.length === 3 && m1.items.join("|") === "编辑路线|删除路线|回到主页" && !/[\u{1F000}-\u{1FFFF}]/u.test(m1.items.join("")) && m1.editTxt === "编辑路线" && m1.delVisible, "菜单弹层含 编辑路线/删除路线/回到主页 无图标 -> " + JSON.stringify(m1));
  await ev(() => document.getElementById("routeMenuEdit").click());
  await wait(200);
  const ed = await ev(() => ({
    editing: document.querySelector(".info-panel").classList.contains("editing"),
    editPillHidden: document.getElementById("editPill").hidden,
    searchRowVisible: getComputedStyle(document.querySelector(".route-edit-row")).display !== "none",
    saveRowVisible: getComputedStyle(document.querySelector(".save-row")).display !== "none",
    opsButtons: document.querySelectorAll("#wpList .wp-item .ops button").length,
    draggables: [...document.querySelectorAll('#wpList .wp-item')].filter(e => e.getAttribute("draggable") === "true").length
  }));
  ok(ed.editing && !ed.editPillHidden && ed.searchRowVisible && ed.saveRowVisible && ed.opsButtons === 66 && ed.draggables === 11, "点 编辑路线 → 编辑模式：搜索/保存/6×11=66 ops/11 draggable -> " + JSON.stringify(ed));

  // A3. 搜索 → 地图预览 + 液态玻璃卡片选天加入（v6：结果行内无加站按钮，改为地图旁卡片）
  await ev(() => { setDayNum(2); });
  await page.type("#edSearch", "新都桥");
  await ev(() => doSearch());
  await wait(400);
  const res0 = await ev(() => ({
    results: document.querySelectorAll("#edResults .res-item").length,
    hasBtn: document.querySelectorAll("#edResults button").length,
    addTxt: document.querySelector("#edResults .res-add") ? document.querySelector("#edResults .res-add").textContent : ""
  }));
  ok(res0.results >= 1 && res0.hasBtn === 0 && /预览/.test(res0.addTxt), "搜索命中且行内无加站按钮(仅预览) -> " + JSON.stringify(res0));
  await ev(() => document.querySelector("#edResults .res-item").click());
  await wait(700);
  const card = await ev(() => ({
    pop: !!document.querySelector(".map-daypop .day-card"),
    title: document.querySelector(".daypop-inner .dc-title") ? document.querySelector(".daypop-inner .dc-title").textContent : "",
    cur2: (document.querySelector('.daypop-inner .dc-day[data-day="2"]') || {}).classList ? document.querySelector('.daypop-inner .dc-day[data-day="2"]').classList.contains("cur") : false,
    pv: [...document.querySelectorAll(".wp-marker svg text")].some(t => t.textContent === "＋"),
    chips: document.querySelectorAll(".daypop-inner .dc-day").length
  }));
  ok(card.pop && /新都桥/.test(card.title) && card.cur2 && card.pv && card.chips >= 2, "预览点+玻璃卡片(第2天高亮) -> " + JSON.stringify(card));
  await ev(() => { var b = document.querySelector('.daypop-inner .dc-day[data-day="2"]'); if (b) b.click(); });
  await wait(400);
  const after = await ev(() => ({
    wp: document.querySelectorAll("#wpList .wp-item").length,
    days: [...document.querySelectorAll("#wpList .day-label")].map(l => l.getAttribute("data-day")),
    dirty: document.querySelector(".save-row").classList.contains("dirty"),
    lastStopName: edCtx.work.stops[edCtx.work.stops.length - 1].name,
    lastDay: edCtx.work.stops[edCtx.work.stops.length - 1].day,
    popGone: !document.querySelector(".map-daypop"),
    // 关键：相邻天的颜色必须不同（按 routeId 种子洗牌后相邻日对比鲜明）
    colorDay1: getComputedStyle(document.querySelector('.wp-item[data-day-key]') || document.querySelector('.wp-item')).color || "",
    day1Color: (function(){ var s = edCtx.work.stops[0]; return dayColor(s.day, edCtx.work.id); })(),
    day2Color: (function(){ var s = edCtx.work.stops.find(function(x){return x.day===2;}); return dayColor(s.day, edCtx.work.id); })()
  }));
  ok(after.wp === 12 && after.days.join(",") === "1,2" && after.dirty && after.lastDay === 2 && after.popGone, "卡片点第2天 → 12点/两天/dirty/卡片关闭 -> " + JSON.stringify(after));
  ok(after.day1Color !== after.day2Color, "调色板：相邻天颜色显著不同（按 routeId 种子洗牌）-> day1=" + after.day1Color + " day2=" + after.day2Color);

  // A4. 菜单再展开一次：现在应显示「完成编辑」(因为在编辑模式)
  await ev(() => document.getElementById("routeMenuBtn").click());
  await wait(150);
  const m2 = await ev(() => ({ editTxt: document.getElementById("routeMenuEdit").textContent.trim(), open: document.getElementById("routeMenuPop").classList.contains("open") }));
  ok(m2.open && m2.editTxt === "完成编辑", "编辑模式下菜单第一项文案=完成编辑 -> " + JSON.stringify(m2));
  // 关闭菜单
  await ev(() => document.getElementById("routeMenuBtn").click());
  await wait(100);

  // A5. 查看模式 → 切回视图模式 → 搜索行/保存行/编辑按钮再次隐藏；再切回编辑模式以保存
  await ev(() => document.getElementById("routeMenuBtn").click());
  await wait(120);
  await ev(() => document.getElementById("routeMenuEdit").click());
  await wait(200);
  const back = await ev(() => ({ editing: document.querySelector(".info-panel").classList.contains("editing"), saveRowVisible: getComputedStyle(document.querySelector(".save-row")).display !== "none" }));
  ok(!back.editing && !back.saveRowVisible, "完成编辑 → 视图模式：editing=false saveRow hidden -> " + JSON.stringify(back));
  // 再进编辑模式准备做保存拦截测试
  await ev(() => document.getElementById("routeMenuBtn").click());
  await wait(120);
  await ev(() => document.getElementById("routeMenuEdit").click());
  await wait(200);

  // A6. 无 Token 保存：点击 #saveBtn（已为液态玻璃 + 仅「保存」文本）→ 拦截 + 引导设置
  const saveText = await ev(() => document.getElementById("saveBtn").textContent.trim());
  ok(saveText === "保存", "保存按钮仅「保存」二字 -> '" + saveText + "'");
  await ev(() => document.getElementById("saveBtn").click());
  await wait(300);
  const blk = await ev(() => ({
    toast: document.getElementById("toast").textContent,
    setOpen: document.getElementById("settingsMask").classList.contains("open"),
    storeN: (JSON.parse(localStorage.getItem("route-platform:v1") || "{}").routes || []).length,
    catN: ROUTE_CATALOG.length,
    wpStill: document.querySelectorAll("#wpList .wp-item").length
  }));
  ok(/Token/.test(blk.toast) && blk.setOpen && blk.storeN === 0 && blk.catN === 2 && blk.wpStill === 12,
    "无 Token 保存被拦截（弹设置）且零落盘 -> " + JSON.stringify(blk));
  await ev(() => document.getElementById("settingsClose").click());
  await wait(150);

  // A7. 无 Token 删除：菜单 → 删除路线 → 二次确认 → 拦截
  await ev(() => { document.getElementById("routeMenuBtn").click(); });
  await wait(120);
  await ev(() => { deleteRouteAsk("cx"); deleteRouteAsk("cx"); });
  await wait(300);
  const delBlk = await ev(() => ({
    toast: document.getElementById("toast").textContent,
    catN: ROUTE_CATALOG.length,
    hasCx: !!ROUTE_PACKS.cx
  }));
  ok(/Token/.test(delBlk.toast) && delBlk.catN === 2 && delBlk.hasCx, "无 Token 删除被拦截、目录不变 -> " + JSON.stringify(delBlk));

  // A8. 回到主页
  await ev(() => { document.getElementById("routeMenuBtn").click(); });
  await wait(120);
  await ev(() => exitToHome());
  await wait(200);
  const back2 = await ev(() => ({
    homeShown: getComputedStyle(document.getElementById("homeMask")).display !== "none",
    name: document.getElementById("routeName").textContent,
    wpHint: document.querySelectorAll("#wpList .ed-hint").length > 0
  }));
  ok(back2.homeShown && back2.name === "未选择路线" && back2.wpHint, "回到主页：homeMask 显示 + 侧栏重置为未选 -> " + JSON.stringify(back2));

  /* ================= 阶段 B：mock fetch 仓库写入 ================= */
  console.log("\n== 阶段 B：mock fetch 仓库写入（零真实网络）==");

  // B1. 安装仓库 mock + 注入 Token
  await ev(() => {
    window.__ghLog = [];
    window.__ghFiles = {};
    window.__ghSeed = function (p, text) { window.__ghFiles[p] = { text: text, sha: "s" + Object.keys(window.__ghFiles).length }; };
    window.__ghSeed("routes/catalog.js", catalogFileText());
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
      if (/project-osrm\.org|restapi\.amap\.com/.test(u)) return Promise.reject(new Error("stub offline"));
      return orig(u, opt);
    };
    store.gh = { repo: "Sunyh-gi/route-planner", branch: "main", token: "smoke-mock-token" };
    saveStore();
    return { en: ghEnabled(), tok: ghNeedToken() };
  }).then(r => { ok(r.en && r.tok, "注入仓库配置 + Token"); });

  // B2. 新建路线（自动编辑模式）→ 搜索加 2 站 → #saveBtn → PUT 路线文件 + catalog
  await ev(() => enterNewRoute());
  await wait(200);
  const editAfterNew = await ev(() => ({ editing: document.querySelector(".info-panel").classList.contains("editing"), saveVisible: getComputedStyle(document.querySelector(".save-row")).display !== "none" }));
  ok(editAfterNew.editing && editAfterNew.saveVisible, "新建路线直接进入编辑模式——搜索/保存可见 -> " + JSON.stringify(editAfterNew));
  await ev(() => {
    setDayNum(1); addStop("云端起点", 30.0, 102.0);
    setDayNum(2); addStop("云端终点", 30.2, 102.2);
    edCtx.work.name = "云端测试线";
    renderRouteHeader();
  });
  await wait(200);
  await ev(() => document.getElementById("saveBtn").click());
  await page.waitForFunction(() => (window.__ghLog || []).filter(l => l.method === "PUT").length >= 2, { timeout: 8000 }).catch(() => {});
  await wait(400);
  const b2 = await ev(() => {
    const puts = window.__ghLog.filter(l => l.method === "PUT");
    const rPut = puts.find(l => l.path.indexOf("routes/") === 0 && l.path !== "routes/catalog.js");
    const cPut = puts.find(l => l.path === "routes/catalog.js");
    let rJson = null;
    if (rPut) {
      const t = rPut.text;
      const a = t.indexOf('"]=');
      const b = t.indexOf(";})();");
      try { if (a >= 0 && b > a) rJson = JSON.parse(t.slice(a + 3, b)); } catch (e) {}
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
      name: document.getElementById("routeName").textContent,
      wp: document.querySelectorAll("#wpList .wp-item").length,
      dirty: document.querySelector(".save-row").classList.contains("dirty"),
      toast: document.getElementById("toast").textContent
    };
  });
  if (!(b2.rName === "云端测试线" && b2.rN === 2)) console.log("   [debug b2] " + JSON.stringify(b2));
  ok(!!b2.id && b2.rMsg === "route: save 云端测试线" && b2.rName === "云端测试线" && b2.rN === 2, "保存 PUT routes/" + b2.id + ".js 载荷正确 -> " + b2.rName + " n=" + b2.rN);
  ok(b2.cMsg === "route: catalog" && b2.catHasNew && b2.catHasCx && b2.catHasYl, "catalog PUT 含 川西+伊犁+新线");
  ok(b2.localCat.indexOf(b2.id) >= 0 && b2.localPacks.indexOf(b2.id) >= 0 && b2.name === "云端测试线" && b2.wp === 2 && !b2.dirty && /已保存/.test(b2.toast), "侧栏：路线名/2点/dirty 已清 -> " + JSON.stringify(b2));

  // B3. 行内改名（点 #routeName 标题） + 保存 → 带 sha 覆盖
  const id = b2.id;
  await ev((rid) => { enterRoute(rid); }, id);
  await page.waitForFunction((rid) => document.querySelectorAll("#wpList .wp-item").length === 2 && (ROUTE_CATALOG || []).some(c => c.id === rid), { timeout: 8000 }, id).catch(() => {});
  await wait(200);
  const viewAfterEnter = await ev(() => ({ editing: document.querySelector(".info-panel").classList.contains("editing"), saveVisible: getComputedStyle(document.querySelector(".save-row")).display !== "none" }));
  ok(!viewAfterEnter.editing && !viewAfterEnter.saveVisible, "enterRoute 入视图模式 → 搜索/保存隐藏 -> " + JSON.stringify(viewAfterEnter));
  // 切到编辑模式后改 + 保存
  await ev(() => { document.getElementById("routeMenuBtn").click(); });
  await wait(120);
  await ev(() => document.getElementById("routeMenuEdit").click());
  await wait(200);
  await ev(() => {
    var sp = document.getElementById("routeName");
    if (sp) sp.dispatchEvent(new Event("click", { bubbles: true }));
  });
  await wait(100);
  await ev(() => {
    var inp = document.querySelector(".route-name-input"); if (!inp) return;
    inp.value = "云端测试线·改";
    inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await wait(200);
  await ev(() => document.getElementById("saveBtn").click());
  await page.waitForFunction((rid) => (window.__ghLog || []).filter(l => l.method === "PUT" && l.path === "routes/" + rid + ".js").length >= 2, { timeout: 8000 }, id).catch(() => {});
  await wait(400);
  const b3 = await ev((rid) => {
    const puts = window.__ghLog.filter(l => l.method === "PUT");
    const rPuts = puts.filter(l => l.path === "routes/" + rid + ".js");
    const cPut = puts.filter(l => l.path === "routes/catalog.js").pop();
    const cur = ROUTE_CATALOG.find(c => c.id === rid);
    return {
      hadSha: rPuts[rPuts.length - 1].hadSha,
      catTxt: cPut ? cPut.text : "",
      name: cur ? cur.name : "",
      pkName: ROUTE_PACKS[rid] ? ROUTE_PACKS[rid].name : "",
      nm: document.getElementById("routeName").textContent
    };
  }, id);
  ok(b3.hadSha, "编辑保存带 sha 覆盖（先读后写）");
  ok(b3.catTxt.indexOf("云端测试线·改") >= 0 && b3.catTxt.indexOf('"name":"云端测试线"') < 0 && b3.name === "云端测试线·改" && b3.pkName === "云端测试线·改" && b3.nm === "云端测试线·改", "改名后目录/数据/侧栏均同步、无重复条目 -> " + JSON.stringify(b3));

  // B4. 删除：菜单 → 删除路线 → 二次确认 → DELETE + catalog 更新
  await ev(() => { document.getElementById("routeMenuBtn").click(); });
  await wait(120);
  await ev((rid) => { document.getElementById("routeMenuDel").click(); deleteRouteAsk(rid); }, id);
  await page.waitForFunction((rid) => (window.__ghLog || []).some(l => l.method === "DELETE" && l.path === "routes/" + rid + ".js"), { timeout: 8000 }, id).catch(() => {});
  await wait(400);
  const b4 = await ev((rid) => {
    const del = window.__ghLog.find(l => l.method === "DELETE" && l.path === "routes/" + rid + ".js");
    const cPut = window.__ghLog.filter(l => l.method === "PUT" && l.path === "routes/catalog.js").pop();
    return { delMsg: del ? del.msg : "", fileGone: !window.__ghFiles["routes/" + rid + ".js"], cat: ROUTE_CATALOG.map(c => c.id).join(","), hasPk: !!ROUTE_PACKS[rid], toast: document.getElementById("toast").textContent };
  }, id);
  ok(b4.delMsg === "route: delete 云端测试线·改" && b4.fileGone && b4.cat === "cx,yl" && !b4.hasPk && /已删除/.test(b4.toast), "删除后仓库文件移除、目录回 2 条 -> " + b4.cat);

  // B5. 复制：v6.4 菜单不再含「复制」，直接调 inlineCopyRoute 验证函数本身仍可用
  await ev(() => enterRoute("yl"));
  await page.waitForFunction(() => (ROUTE_PACKS.yl && document.querySelectorAll("#wpList .wp-item").length === 21), { timeout: 8000 }).catch(() => {});
  await wait(300);
  await ev(() => { window.prompt = function () { return "伊犁副本"; }; inlineCopyRoute(); });
  await wait(400);
  const b5 = await ev(() => ({
    name: document.getElementById("routeName").textContent,
    wp: document.querySelectorAll("#wpList .wp-item").length,
    dirty: document.querySelector(".save-row").classList.contains("dirty"),
    activeId: activeRouteId,
    editing: document.querySelector(".info-panel").classList.contains("editing")
  }));
  ok(b5.name === "伊犁副本" && b5.wp === 21 && b5.dirty && b5.activeId === null && b5.editing, "复制伊犁预填 21 点到内联编辑器（编辑模式开） -> " + JSON.stringify(b5));

  // B6. 远端刷新
  await ev(() => {
    window.__ghSeed("routes/rem.js", routeFileText({ id: "rem", name: "远端拉取线", stops: [{ name: "远程A", lat: 31.0, lng: 103.0, day: 1, tag: "" }], segs: {} }));
    const cur = ROUTE_CATALOG.map(function (c) { return { id: c.id, name: c.name, file: c.file, days: c.days, n: c.n, color: c.color }; });
    cur.push({ id: "rem", name: "远端拉取线", file: "routes/rem.js", days: 1, n: 1, color: "#0D9488" });
    window.__ghFiles["routes/catalog.js"].text = "window.ROUTE_CATALOG=" + JSON.stringify(cur) + ";\nwindow.ROUTE_PLACES=" + JSON.stringify(window.ROUTE_PLACES || []) + ";\n";
    doRefresh();
  });
  await page.waitForFunction(() => (ROUTE_CATALOG || []).some(c => c.id === "rem"), { timeout: 8000 }).catch(() => {});
  await wait(300);
  const b6 = await ev(() => ({ cat: ROUTE_CATALOG.map(c => c.id).join(","), remStops: ROUTE_PACKS.rem ? ROUTE_PACKS.rem.stops.length : -1, toast: document.getElementById("toast").textContent }));
  ok(b6.cat.indexOf("rem") >= 0 && b6.remStops === 1 && /刷新完成/.test(b6.toast), "远端刷新拉取新路线 rem -> " + JSON.stringify(b6));

  // B7. 迁移旧路线
  await ev(() => {
    store.routes = [{ id: "legacy-smoke", name: "旧版遗留线", stops: [{ name: "旧点A", lat: 30.1, lng: 102.1, day: 1, tag: "" }, { name: "旧点B", lat: 30.2, lng: 102.2, day: 2, tag: "" }], segs: {}, preset: { c: 2, tag: "旧" } }];
    saveStore();
    migrateLegacy();
  });
  await page.waitForFunction(() => (window.__ghLog || []).some(l => l.method === "PUT" && l.path === "routes/legacy-smoke.js"), { timeout: 8000 }).catch(() => {});
  await wait(400);
  const b7 = await ev(() => {
    const puts = window.__ghLog.filter(l => l.method === "PUT");
    const lPut = puts.find(l => l.path === "routes/legacy-smoke.js");
    const cPut = puts.filter(l => l.path === "routes/catalog.js").pop();
    return { lMsg: lPut ? lPut.msg : "", catHasLegacy: cPut ? cPut.text.indexOf("legacy-smoke") >= 0 : false, catN: ROUTE_CATALOG.length, legacyN: legacyRoutes().length, toast: document.getElementById("toast").textContent };
  });
  ok(b7.lMsg === "route: migrate 旧版遗留线" && b7.catHasLegacy && b7.catN === 4 && b7.legacyN === 0 && /迁移完成/.test(b7.toast), "旧路线迁移入库并清空本地 -> cat=" + b7.catN);

  // B8. 主页画廊 4 卡
  await ev(() => exitToHome());
  await wait(400);
  const cards = await ev(() => [...document.querySelectorAll(".home-card")].map(c => c.querySelector(".nm").textContent.trim()));
  ok(cards.length === 4 && cards.some(t => t.indexOf("旧版遗留线") >= 0), "主页画廊 4 卡 -> " + JSON.stringify(cards));
  await page.screenshot({ path: path.join(__dirname, "_shot_platform.png") });

  /* ================= 阶段 C：hash 路由（浏览器前进/后退 + F5 恢复） ================= */
  console.log("\n== 阶段 C：hash 路由（浏览器前进/后退 + F5 恢复）==");

  // C0. 全新加载主页作为确定性历史起点；清掉 mock token，防止 reload 后 ghInit 打真实网络
  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await wait(1500);
  await ev(() => { if (window.store) { store.gh = {}; saveStore(); } });
  const waitName = n => page.waitForFunction(nm => document.getElementById("routeName") && document.getElementById("routeName").textContent === nm, { timeout: 15000 }, n).catch(() => {});

  // C1. 主页点川西卡 → hash=#/r/cx 且进入路线视图（homeMask 隐藏）
  await ev(() => document.querySelector('.home-card[data-route="cx"]').click());
  await waitName("川西路线");
  await wait(300);
  const c1 = await ev(() => ({ hash: location.hash, home: getComputedStyle(document.getElementById("homeMask")).display !== "none", name: document.getElementById("routeName").textContent }));
  ok(c1.hash === "#/r/cx" && !c1.home && c1.name === "川西路线", "点卡片 → hash=#/r/cx 进入路线视图 -> " + JSON.stringify(c1));

  // C2. 浏览器后退 → 回主页 #/
  await page.goBack().catch(() => {});
  await wait(800);
  const c2 = await ev(() => ({ hash: location.hash, home: getComputedStyle(document.getElementById("homeMask")).display !== "none", name: document.getElementById("routeName").textContent }));
  ok(c2.hash === "#/" && c2.home && c2.name === "未选择路线", "浏览器后退 → 回主页 #/ -> " + JSON.stringify(c2));

  // C3. 主页点 ⚙ 设置 → #/s 且设置层 open（叠加在主页之上）
  await ev(() => document.getElementById("homeSettings").click());
  await wait(400);
  const c3 = await ev(() => ({ hash: location.hash, open: document.getElementById("settingsMask").classList.contains("open"), home: getComputedStyle(document.getElementById("homeMask")).display !== "none" }));
  ok(c3.hash === "#/s" && c3.open && c3.home, "主页设置 → hash=#/s 叠加打开 -> " + JSON.stringify(c3));

  // C4. 浏览器后退 → 设置关闭回主页 #/
  await page.goBack().catch(() => {});
  await wait(400);
  const c4 = await ev(() => ({ hash: location.hash, open: document.getElementById("settingsMask").classList.contains("open") }));
  ok(c4.hash === "#/" && !c4.open, "后退 → 关设置回 #/ -> " + JSON.stringify(c4));

  // C5. 浏览器前进 → 设置重新打开 #/s
  await page.goForward().catch(() => {});
  await wait(400);
  const c5 = await ev(() => ({ hash: location.hash, open: document.getElementById("settingsMask").classList.contains("open") }));
  ok(c5.hash === "#/s" && c5.open, "前进 → 设置重开 #/s -> " + JSON.stringify(c5));

  // C6. 点设置关闭按钮 → 回 #/
  await ev(() => document.getElementById("settingsClose").click());
  await wait(300);
  const c6 = await ev(() => ({ hash: location.hash, open: document.getElementById("settingsMask").classList.contains("open") }));
  ok(c6.hash === "#/" && !c6.open, "关闭设置 → #/ -> " + JSON.stringify(c6));

  // C7. 手改 hash 到 #/n（等价地址栏直达新建）→ hashchange → 新建编辑模式
  await ev(() => { location.hash = "#/n"; });
  await page.waitForFunction(() => location.hash === "#/n" && getComputedStyle(document.getElementById("homeMask")).display === "none", { timeout: 8000 }).catch(() => {});
  const c7 = await ev(() => ({ hash: location.hash, home: getComputedStyle(document.getElementById("homeMask")).display !== "none", editing: !!(window.edCtx && edCtx.editMode) }));
  ok(c7.hash === "#/n" && !c7.home && c7.editing === true, "手改 #/n → 新建直接编辑模式 -> " + JSON.stringify(c7));

  // C8. 手改 hash 回 #/ → 回主页（新建 dirty → confirm 自动 accept）
  await ev(() => { location.hash = "#/"; });
  await wait(600);
  const c8 = await ev(() => ({ hash: location.hash, home: getComputedStyle(document.getElementById("homeMask")).display !== "none" }));
  ok(c8.hash === "#/" && c8.home, "手改 #/ → 回主页 -> " + JSON.stringify(c8));

  // C9. F5 刷新恢复：带 hash 直接加载（等价停在路线页按刷新），boots 补丁应恢复 cx 视图
  await page.goto(URL + "#/r/cx", { waitUntil: "load", timeout: 60000 });
  await waitName("川西路线");
  await wait(300);
  const c9 = await ev(() => ({ hash: location.hash, home: getComputedStyle(document.getElementById("homeMask")).display !== "none", name: document.getElementById("routeName").textContent }));
  ok(c9.hash === "#/r/cx" && !c9.home && c9.name === "川西路线", "F5 刷新 #/r/cx → 恢复路线视图 -> " + JSON.stringify(c9));
  await page.screenshot({ path: path.join(__dirname, "_shot_hash.png") });

  /* ================= 汇总 ================= */
  const real = realErr();
  console.log("\n== 控制台错误(" + errors.length + " 条，非网络 " + real.length + " 条) ==");
  real.slice(0, 8).forEach(e => console.log("   " + e.slice(0, 200)));
  console.log("\n通过 " + (step - fail) + "/" + step + (fail ? "  \u26a0 失败 " + fail + " 项" : " \u2713 全部通过"));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("SMOKE CRASH:", e); process.exit(2); });
