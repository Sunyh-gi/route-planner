/* ============================================================
 * 冒烟测试：线路规划平台 v6.18（视图/编辑模式 + 新菜单 + 调色板种子洗牌 + 移动端只读 / OSRM 失败可见 / 重复同名点 / 语义）
 * 阶段 A：无 Token 只读回归（默认视图模式；点 ⋯ → 编辑路线进入编辑模式后验证搜索/卡片/加站）
 * 阶段 B：mock fetch 模拟 GitHub 仓库写入
 * 阶段 C：hash 路由（浏览器前进/后退 + F5 恢复）
 * 阶段 D：v6.18 新增行为（重复同名点可共存 / 同坐标段跳过 OSRM / 失败提示条与重试 / 标题语义 / 窄屏桌面保留编辑 / 触摸设备只读）
 * 用法：node _smoke.js
 *   依赖 puppeteer-core 与系统 Edge；若二者不在默认解析路径，用环境变量指定：
 *   PUPPETEER_PATH=<puppeteer-core 路径>  EDGE_PATH=<Edge 可执行文件路径>
 * ============================================================ */
const puppeteer = require(process.env.PUPPETEER_PATH || "puppeteer-core");
const path = require("path");

const EDGE = process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
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
  ok(home.shown && home.cards.join(",") === "yl,cx" && home.badges === 0, "画廊 2 卡无徽章（四季分组：夏 yl 在前、秋 cx 在后） -> " + home.cards.join(","));

  // A2. 四季壁纸系统：manifest 就绪 + 东八区当季壁纸已应用
  const wp1 = await ev(() => ({
    manifest: !!(window.WALLPAPER_MANIFEST && window.WALLPAPER_MANIFEST.autumn && window.WALLPAPER_MANIFEST.autumn.length === 2
      && window.WALLPAPER_MANIFEST.spring && window.WALLPAPER_MANIFEST.spring.length === 1),
    st: window.wpState ? window.wpState() : null
  }));
  ok(wp1.manifest && wp1.st && !!wp1.st.season && wp1.st.src === wp1.st.list[wp1.st.idx] && wp1.st.src.indexOf("assets/wp/") === 0,
    "四季壁纸就绪（东八区当季=" + (wp1.st ? wp1.st.season : "?") + "） -> " + (wp1.st ? wp1.st.src + " | " + wp1.st.dataWp : "null"));

  // A3. 点击左上 logo 在当季壁纸间循环（淡入淡出结束后 src 交替、可循环回位）
  const L1 = wp1.st.list.length;
  await ev(() => { document.getElementById("brandLogo").click(); });
  await wait(950);
  const wp2 = await ev(() => window.wpState());
  ok(wp2.list.length === L1 && wp2.idx === (wp1.st.idx + 1) % L1 && wp2.src === wp2.list[wp2.idx], "点 logo 循环壁纸 -> " + wp2.src);
  await ev(() => { document.getElementById("brandLogo").click(); });
  await wait(950);
  const wp3 = await ev(() => window.wpState());
  ok(wp3.idx === wp1.st.idx && wp3.src === wp3.list[wp3.idx], "再点循环回第 1 张（闭合） -> " + wp3.src);
  ok(home.cat === "cx,yl" && home.packs === 0, "目录已注册且数据未预载 -> " + JSON.stringify(home));
  ok(home.routeName === "未选择路线", "侧栏路线名=未选择路线");
  ok(home.tools.length === 3 && /新建/.test(home.tools[0]) && /设置/.test(home.tools[1]) && /刷新/.test(home.tools[2]), "首页工具 3 件套 → " + home.tools.join("|"));

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

  // C10. 自动取景：打开路线后视口应包含全部地点且已放大（v6.5.3 fitRouteView）
  await page.waitForFunction(() => { try { var b = map.getBounds(); var st = window.ROUTE_PACKS && ROUTE_PACKS.cx && ROUTE_PACKS.cx.stops || []; return st.length > 0 && st.every(s => b.contains([s.lat, s.lng])); } catch (e) { return false; } }, { timeout: 10000 }).catch(() => {});
  const c10 = await ev(() => {
    var b = map.getBounds();
    var st = (window.ROUTE_PACKS && ROUTE_PACKS.cx && ROUTE_PACKS.cx.stops) || [];
    var all = st.length > 0 && st.every(s => b.contains([s.lat, s.lng]));
    var vp = map.getSize();
    return { zoom: Math.round(map.getZoom() * 10) / 10, all: all, n: st.length, marginLeft: Math.round(b.getWest() === -Infinity ? -1 : 0) >= 0, vp: { x: vp.x, y: vp.y } };
  });
  ok(c10.all === true && c10.n === 11 && c10.zoom > 4, "自动取景：11 点全部在视口内 & zoom=" + c10.zoom + "（>4 说明已放大） -> " + JSON.stringify(c10));
  await page.screenshot({ path: path.join(__dirname, "_shot_hash.png") });

  /* ================= 阶段 D：v6.18 新增行为（移动端只读 / OSRM 失败可见 / 重复同名点 / 语义） ================= */
  console.log("\n== 阶段 D：v6.18 新增行为 ==");

  // D1. 重复同名点（含同坐标）可共存：不拦截、不合并，各自成行成点
  await ev(() => { location.hash = "#/n"; });
  await page.waitForFunction(() => location.hash === "#/n" && !!window.edCtx && !!edCtx.work, { timeout: 8000 }).catch(() => {});
  await wait(300);
  const d1 = await ev(() => {
    // C9/D4 的整页刷新会丢掉阶段 A 装的 fetch stub，这里重装一次，让 OSRM 失败可确定复现
    if (!window.__osrmStubbedD) {
      var orig = window.fetch.bind(window);
      window.fetch = function (url, opt) {
        if (/router\.project-osrm\.org|restapi\.amap\.com/.test(String(url))) return Promise.reject(new Error("osrm stub offline"));
        return orig(url, opt);
      };
      window.__osrmStubbedD = true;
    }
    window.osrmNoteReset();
    edCtx.work.stops = [
      { name: "新都桥镇", lat: 30.035972, lng: 101.507144, day: 1, tag: "" },
      { name: "新都桥镇", lat: 30.035972, lng: 101.507144, day: 1, tag: "" },
      { name: "甲根坝镇", lat: 29.846995, lng: 101.559075, day: 2, tag: "" }
    ];
    normalizeRoute(edCtx.work);
    applyEditToMap();
    return {
      n: edCtx.work.stops.length,
      names: edCtx.work.stops.map(function (s) { return s.name; }).join("|"),
      rows: document.querySelectorAll("#wpList .wp-item").length,
      markers: document.querySelectorAll(".wp-marker").length
    };
  });
  ok(d1.n === 3 && d1.names === "新都桥镇|新都桥镇|甲根坝镇" && d1.rows === 3 && d1.markers === 3,
    "重复同名点（同坐标）可共存、各自成行成点 -> " + JSON.stringify(d1));

  // D2. 同坐标相邻段被跳过（不发 OSRM，不产生假失败）；真失败的段聚合进可见提示条 + 重试按钮
  await page.waitForFunction(() => window._osrmFail && Object.keys(_osrmFail).length > 0, { timeout: 8000 }).catch(() => {});
  await wait(600);
  const d2 = await ev(() => ({
    fails: Object.keys(window._osrmFail || {}).length,
    noteHidden: document.getElementById("osrmNote").hidden,
    txt: document.getElementById("osrmNote").textContent,
    hasRetry: !!document.querySelector("#osrmNote .osrm-retry")
  }));
  ok(d2.fails === 1 && !d2.noteHidden && d2.hasRetry && /未取到实际路线/.test(d2.txt),
    "同坐标段被跳过（仅 1 段真失败）+ 失败不再静默：提示条含重试 -> " + JSON.stringify(d2));

  // D3. 提示条内「重试」可点：清标记 → 重新发起（离线仍失败 → 提示条再现）
  await ev(() => { var b = document.querySelector("#osrmNote .osrm-retry"); if (b) b.click(); });
  await wait(1400);
  const d3 = await ev(() => ({ hasRetry: !!document.querySelector("#osrmNote .osrm-retry"), fails: Object.keys(window._osrmFail || {}).length }));
  ok(d3.hasRetry && d3.fails >= 1, "重试按钮点击后重新发起并再次汇总失败 -> " + JSON.stringify(d3));

  // D4. 语义：文档标题随视图变化 + og:title 同步 + 唯一 h1
  await page.goto(URL + "#/r/cx", { waitUntil: "load", timeout: 60000 });
  await waitName("川西路线");
  await wait(300);
  const d4 = await ev(() => ({
    title: document.title,
    og: (document.querySelector('meta[property="og:title"]') || {}).content || "",
    h1: (document.querySelector("h1.sr-only") || {}).textContent || ""
  }));
  ok(d4.title === "川西路线 · 线路规划平台" && d4.og === d4.title && d4.h1 === "线路规划平台",
    "页面语义：标题随视图变化 + og:title 同步 + 唯一 h1 -> " + JSON.stringify(d4));

  // D5. 窄屏桌面窗口（鼠标）仍保留编辑入口——只读只针对触摸设备
  await page.setViewport({ width: 700, height: 900 });
  await wait(500);
  const d5 = await ev(() => ({
    isMobile: document.body.classList.contains("is-mobile"),
    menuVisible: getComputedStyle(document.getElementById("routeMenuBtn")).display !== "none",
    coarse: window.matchMedia("(pointer: coarse)").matches
  }));
  ok(!d5.coarse && !d5.isMobile && d5.menuVisible,
    "窄屏桌面窗口不夺编辑能力（is-mobile=false、⋯ 菜单可见）-> " + JSON.stringify(d5));

  // D6. 触摸设备（手机）→ 只读：is-mobile 生效、⋯ 菜单隐藏、编辑模式恒关
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await wait(700);
  const d6 = await ev(() => ({
    coarse: window.matchMedia("(pointer: coarse)").matches,
    isMobile: document.body.classList.contains("is-mobile"),
    menuHidden: getComputedStyle(document.getElementById("routeMenuBtn")).display === "none",
    editing: !!(window.edCtx && edCtx.editMode)
  }));
  ok(d6.coarse && d6.isMobile && d6.menuHidden && !d6.editing,
    "手机（触摸）→ 只读：is-mobile 生效、编辑入口隐藏、编辑模式恒关 -> " + JSON.stringify(d6));

  // D7. v6.20.2 回归：步行/骑马段必须真画成虚线、且恒在实线之上
  //     旧 bug 三条叠加：①按段序绘制，与相邻驾车段完全重叠时被同色实线整条盖掉；
  //     ②OSRM 回填 onDone 无条件 setStyle({dashArray:null})，把脚力段抹成实线；
  //     ③无浅色缝隙底色，空隙透出的是底下同色实线 → 视觉上依旧「实线」。
  //     断言：伊犁环线含 1 段 foot + 1 段 cycling（数据层 p 字段），
  //     渲染后应有 2×N 条带 stroke-dasharray 的矢量（casing+主线）与 N 条缝隙底色层，
  //     线帽 butt，且全部排在无 dash 的实线层之后（DOM 顺序即绘制顺序）。
  //     节奏值不写死：与页面 DASH_MODE 对齐（v6.20.3 起），调节奏无需改断言。
  await page.setViewport({ width: 1440, height: 900, isMobile: false, hasTouch: false });
  await page.goto(URL + "#/r/yl", { waitUntil: "load", timeout: 60000 });
  await waitName("伊犁环线（夏）");
  await wait(2500); // 留出 OSRM 回填窗口——关键验证：回填不得抹平虚线
  const expectDash = await ev(() => String(window.DASH_MODE || "").replace(/\s/g, ""));
  const d7 = await ev(() => {
    const pack = window.ROUTE_PACKS && window.ROUTE_PACKS.yl;
    const segs = (pack && pack.segs) || {};
    const footSegs = Object.keys(segs).filter(function (k) {
      return segs[k] && (segs[k].p === "foot" || segs[k].p === "cycling");
    }).length;
    const SW = window.SOLID_W || {}, DW = window.DASH_W || {};
    const paths = Array.from(document.querySelectorAll("path.leaflet-interactive"));
    const dashed = [], solidLineIdx = [];
    let gapLayers = 0;
    paths.forEach(function (el, i) {
      const w = el.getAttribute("stroke-width");
      if (w === String(DW.gap)) { gapLayers++; return; } // 缝隙底色层，不参与「虚实先后」比较
      const da = el.getAttribute("stroke-dasharray");
      if (da) dashed.push({ i: i, dash: da, cap: el.getAttribute("stroke-linecap"), w: w });
      else solidLineIdx.push(i);
    });
    return {
      footSegs: footSegs,
      nDashed: dashed.length,
      gapLayers: gapLayers,
      dashVals: dashed.map(function (x) { return x.dash.replace(/\s/g, ""); }),
      caps: dashed.map(function (x) { return x.cap; }),
      widths: dashed.map(function (x) { return x.w; }),
      solidW: { main: String(SW.main), case: String(SW.case) },
      dashW: { main: String(DW.main), case: String(DW.case) },
      lastSolid: solidLineIdx.length ? Math.max.apply(null, solidLineIdx) : -1,
      firstDash: dashed.length ? Math.min.apply(null, dashed.map(function (x) { return x.i; })) : 1e9
    };
  });
  ok(
    d7.footSegs >= 2 &&
    d7.nDashed === d7.footSegs * 2 &&
    d7.gapLayers === d7.footSegs &&
    !!expectDash && d7.dashVals.every(v => v === expectDash) &&
    d7.caps.every(c => c === "butt") &&
    d7.widths.filter(w => w === d7.dashW.main).length === d7.footSegs &&
    d7.widths.filter(w => w === d7.dashW.case).length === d7.footSegs &&
    parseFloat(d7.dashW.main) < parseFloat(d7.solidW.main) &&   // v6.20.4：虚线整体细一档
    parseFloat(d7.dashW.case) < parseFloat(d7.solidW.case) &&
    parseFloat(d7.dashW.gap || d7.gapLayers) > 0 &&
    d7.firstDash > d7.lastSolid,
    "步行/骑马虚线：dash=" + expectDash + "（对齐页面 DASH_MODE）+ butt 帽 + 浅色缝隙层 + 恒在实线之上 + 线宽比实线细一档（" + d7.dashW.main + "/" + d7.solidW.main + "，脚力段 " + d7.footSegs + " 段）-> " + JSON.stringify(d7));

  // D8. v6.20.5 全量路线数据自检：页面 auditRouteData() 对每条已加载路线扫
  //     p 取值合法性 / poly 是否存在 / 站点坐标与 day，结果挂 window.__routeAudit。
  //     这条断言保证「以后手写的路线数据写错会被测出来」，而不只是靠人眼。
  //     v6.20.7 起 endpointGaps 的口径改为「端点离图钉 >1km **且**该图钉四周无任何段到达」：
  //     鲜花台（景点没公路、驾车段从 2.5km 外起步，但步行段直达）属**正确留白**，不再计入。
  //     故本例 yl 应为 0 处 —— 断言「归零」才算正确修复；同时要求 audit 里确实带了
  //     endpointGaps 这个字段（证明检查真的在跑，而非字段缺失导致的恒空）。
  await page.setViewport({ width: 1440, height: 900, isMobile: false, hasTouch: false });
  const audit = [];
  for (const rid of ["cx", "yl"]) {
    await page.goto(URL + "#/r/" + rid, { waitUntil: "load", timeout: 60000 });
    await wait(1800);
    // __routeAudit 以 rid 为键，直接按 rid 取（不再用 keys().pop() 兜底——多路线并发时不可靠）
    const one = await ev(k => (window.__routeAudit || {})[k] || null, rid);
    audit.push(one || { id: rid, stats: null, issues: ["未产生审计结果"], endpointGaps: null });
  }
  const badData = audit.filter(a => a && a.issues && a.issues.length);
  const footTotal = audit.reduce((n, a) => n + ((a && a.stats && a.stats.foot) || 0), 0);
  const gapTotal = audit.reduce((n, a) => n + ((a && a.endpointGaps && a.endpointGaps.length) || 0), 0);
  const fieldOk = audit.every(a => a && Array.isArray(a.endpointGaps));
  ok(
    audit.length === 2 && badData.length === 0 && footTotal >= 2 && gapTotal === 0 && fieldOk &&
    audit.every(a => a && a.stats && a.stats.stops >= 2 && a.stats.segs >= 1),
    "全量路线数据自检通过（p 合法 / poly 齐全 / 坐标与 day 完整，脚力段 " + footTotal + " 个，真端点缺口 " + gapTotal + " 处）-> " +
      JSON.stringify(audit.map(a => ({ id: a && a.id, stops: a && a.stats && a.stats.stops, segs: a && a.stats && a.stats.segs, foot: a && a.stats && a.stats.foot, issues: a && a.issues, gaps: a && a.endpointGaps && a.endpointGaps.length }))));

  // D8b. v6.20.7 鲜花台留白判定：段6（驾车）起点离图钉 2466m 属正确留白（景点没公路），
  //      必须① 不被报成缺口；② 段5（步行）末端确实连到了图钉附近。
  const footCover = await ev(() => {
    const R = window.ROUTE_PACKS && window.ROUTE_PACKS.yl;
    if (!R) return { err: "yl 未加载" };
    const A = R.stops[5], B = R.stops[6]; // 夏塔 → 鲜花台（步行）
    const key = A.lat.toFixed(5) + "," + A.lng.toFixed(5) + "|" + B.lat.toFixed(5) + "," + B.lng.toFixed(5);
    const c = (R.segs || {})[key];
    if (!c || !c.poly || !c.poly.length) return { err: "段5 无数据" };
    const last = c.poly[c.poly.length - 1];
    const d = L.latLng(last).distanceTo(L.latLng(B.lat, B.lng));
    return { n: c.poly.length, p: c.p || "drive", endGap: Math.round(d) };
  });
  ok(
    footCover && !footCover.err && footCover.p === "foot" && footCover.n >= 150 && footCover.endGap <= 200,
    "鲜花台图钉由步行段覆盖：段5（" + (footCover && footCover.p) + "，" + (footCover && footCover.n) + " 点）末端距图钉 " +
      (footCover && footCover.endGap) + "m（≤200m）→ 驾车段的 2.5km 留白属正确地图事实，不报错 -> " + JSON.stringify(footCover));

  // D9. v6.20.5 数据层护栏：段缺 poly / 非法 p 不得抛错（旧实现在 .slice 处直接 TypeError）
  const guard = await ev(() => {
    const A = { name: "A", lat: 30, lng: 100, day: 1 }, B = { name: "B", lat: 30.1, lng: 100.1, day: 1 };
    const key = "30.00000,100.00000|30.10000,100.10000";
    const out = {};
    try { out.missingPoly = renderGeneric({ id: "__g1", name: "g1", stops: [A, B], segs: { [key]: { d: 1, m: 1 } } }).segWarns; }
    catch (e) { out.missingPoly = "THREW:" + e.message; }
    try { out.invalidP = renderGeneric({ id: "__g2", name: "g2", stops: [A, B], segs: { [key]: { d: 1, m: 1, p: "walking", poly: [[30, 100], [30.1, 100.1]] } } }).segWarns; }
    catch (e) { out.invalidP = "THREW:" + e.message; }
    // 占位节奏与 DASH_MODE 撞车时也不得被误判为脚力段
    const old = window.DASH_MODE; window.DASH_MODE = window.DASH_PENDING;
    const pend = renderGeneric({ id: "__g3", name: "g3", stops: [A, B], segs: {} }).segLayers[0];
    window.DASH_MODE = old;
    out.pendingFootFlag = pend.foot;
    // 与 expectDash 同口径归一化（去空格）再比对，避免 "12, 6" vs "12,6" 的假失败
    out.refill = { foot: String(refillDash(true) || "").replace(/\s/g, ""), pending: refillDash(false) };
    return out;
  });
  ok(
    Array.isArray(guard.missingPoly) && guard.missingPoly.length === 1 &&
    Array.isArray(guard.invalidP) && guard.invalidP.length === 1 &&
    guard.pendingFootFlag === false &&
    guard.refill.foot === expectDash && guard.refill.pending === null,
    "数据层护栏：缺 poly / 非法 p 不抛错且给出告警 + 占位节奏与 DASH_MODE 撞车不被误判 + 回填按用途保留 -> " + JSON.stringify(guard));

  /* ================= 汇总 ================= */
  const real = realErr();
  console.log("\n== 控制台错误(" + errors.length + " 条，非网络 " + real.length + " 条) ==");
  real.slice(0, 8).forEach(e => console.log("   " + e.slice(0, 200)));
  console.log("\n通过 " + (step - fail) + "/" + step + (fail ? "  \u26a0 失败 " + fail + " 项" : " \u2713 全部通过"));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("SMOKE CRASH:", e); process.exit(2); });
