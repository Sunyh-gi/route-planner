/* 冒烟测试：线路规划平台 编辑器核心流程（无头 Edge + puppeteer-core） */
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

  let step = 0, fail = 0;
  function ok(cond, name) {
    step++;
    if (cond) console.log("  ✓ [" + step + "] " + name);
    else { fail++; console.log("  ✗ [" + step + "] " + name); }
  }

  await page.goto(URL, { waitUntil: "load", timeout: 60000 });
  await new Promise(r => setTimeout(r, 2500));

  // ---- 1. 启动：主页画廊 + 目录注册（内置数据不预载，点卡片才按需加载）----
  const homeShown = await page.evaluate(() => getComputedStyle(document.getElementById("homeMask")).display !== "none");
  const btns = await page.$$eval(".route-switch .rs-btn", els => els.map(e => e.getAttribute("data-route")));
  ok(homeShown && btns.includes("cx") && btns.includes("yl"), "首屏主页画廊 + 侧栏目录含 cx/yl -> " + btns.join(","));
  const initMeta = await page.evaluate(() => ({
    meta: ROUTE_META.map(m => m.id).join(","),
    packs: Object.keys(ROUTE_PACKS).length,
    rendered: !!(currentGroup && currentGroup.getLayers().length)
  }));
  ok(initMeta.meta === "cx,yl" && initMeta.packs === 0 && !initMeta.rendered, "目录已注册、数据未预载 -> " + JSON.stringify(initMeta));
  const mapOk = await page.evaluate(() => !!window.map && !!window.ROUTE_CATALOG && !!window.ROUTE_PLACES);
  ok(mapOk, "window.map / ROUTE_CATALOG / ROUTE_PLACES 可用");

  // ---- 2. 点击主页川西卡片 -> 懒加载 routes/cx.js 并渲染 ----
  await page.evaluate(() => document.querySelector('.home-card[data-route="cx"]').click());
  await new Promise(r => setTimeout(r, 1600));
  const cxWp = await page.$$eval("#wpList .wp-item", els => els.length).catch(() => -1);
  ok(cxWp === 11, "点川西卡片后加载并渲染 11 点, n=" + cxWp);
  const cxActive = await page.evaluate(() => ROUTE_PACKS.cx ? ROUTE_PACKS.cx.stops.length : -1);
  ok(cxActive === 11, "ROUTE_PACKS.cx 已加载 11 点");

  // ---- 2. 新建路线：打开编辑器 ----
  await page.evaluate(() => openNewEditor());
  await new Promise(r => setTimeout(r, 300));
  const modalOpen = await page.$eval("#editorMask", e => e.classList.contains("open")).catch(() => false);
  ok(modalOpen, "新建路线弹窗已打开");

  // ---- 3. GPS 坐标搜索并加站（赛里木湖 WGS-84）----
  await page.type("#edSearch", "44.49427, 81.15873");
  await page.evaluate(() => doSearch());
  await new Promise(r => setTimeout(r, 400));
  const stops1 = await page.$$eval("#edStops .ed-stop", els => els.map(e => e.textContent));
  ok(stops1.length === 1 && /赛里木湖|GPS 点/.test(stops1[0] || ""), "GPS 坐标已加入列表 -> " + JSON.stringify(stops1));
  const dayLbl = await page.$eval("#dayNum", e => e.textContent);
  ok(dayLbl === "1", "默认加入第1天");

  // ---- 4. 切换天数为 2 后本地地名搜索加站 ----
  await page.evaluate(() => setDayNum(2));
  await page.type("#edSearch", "新都桥");
  await page.evaluate(() => doSearch());
  await new Promise(r => setTimeout(r, 400));
  const resItems = await page.$$eval("#edResults .res-item", els => els.length).catch(() => 0);
  ok(resItems >= 1, "本地内置地名命中, res=" + resItems);
  if (resItems > 0) {
    await page.evaluate(() => document.querySelector("#edResults .res-add").click());
    await new Promise(r => setTimeout(r, 400));
  }
  const stops2 = await page.$$eval("#edStops .ed-stop", els => els.length).catch(() => 0);
  ok(stops2 === 2, "第二个地点已加入, n=" + stops2);

  // ---- 5. 保存路线 ----
  await page.type("#edName", "冒烟测试线");
  await page.evaluate(() => document.getElementById("edSave").click());
  await new Promise(r => setTimeout(r, 800));
  const saved = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("route-platform:v1") || "{}");
    return { n: (s.routes || []).length, nm: (s.routes || [])[0] && (s.routes || [])[0].name };
  });
  ok(saved.n === 1 && saved.nm === "冒烟测试线", "localStorage 已保存路线 -> " + JSON.stringify(saved));
  const btnNames = await page.$$eval(".route-switch .rs-btn .nm", els => els.map(e => e.textContent));
  ok(btnNames.some(n => n === "冒烟测试线"), "切换列表出现新路线 -> " + JSON.stringify(btnNames));

  // ---- 6. 编辑刚保存的路线：移动 day / 删点 ----
  await page.evaluate(() => openEditFor(JSON.parse(localStorage.getItem("route-platform:v1")).routes[0].id));
  await new Promise(r => setTimeout(r, 400));
  const stopRows = await page.$$eval("#edStops .ed-stop", els => els.length).catch(() => 0);
  ok(stopRows === 2, "编辑弹窗显示 2 个地点");
  // 将第 1 个点移到第 2 天之后（◀/▶ 操作由 data-op=nextDay）
  await page.evaluate(() => document.querySelector('#edStops .ed-stop[data-i="0"] button[data-op="nextDay"]').click());
  await new Promise(r => setTimeout(r, 300));
  const day1 = await page.evaluate(() => edCtx.work.stops[0].day);
  ok(day1 === 2, "第1点已移到第2天, day=" + day1);

  // ---- 7. 删除一条自定义路线 ----
  await page.evaluate(() => { document.getElementById("editorMask").classList.remove("open"); });
  const customId = await page.evaluate(() => JSON.parse(localStorage.getItem("route-platform:v1")).routes[0].id);
  await page.evaluate((cid) => deleteRouteAsk(cid), customId);
  await page.evaluate((cid) => deleteRouteAsk(cid), customId); // 二次确认
  await new Promise(r => setTimeout(r, 300));
  const afterDel = await page.evaluate(() => (JSON.parse(localStorage.getItem("route-platform:v1") || "{}").routes || []).length);
  ok(afterDel === 0, "路线已删除, store n=" + afterDel);

  // ---- 8. 复制内置路线为可编辑 ----
  await page.evaluate(() => copyRoute("yl"));
  await new Promise(r => setTimeout(r, 500));
  const copyStops = await page.$$eval("#edStops .ed-stop", els => els.length).catch(() => 0);
  ok(copyStops === 21, "复制伊犁→编辑器含 21 点");
  // 关闭编辑器，检查切换列表
  await page.evaluate(() => closeEditor());
  await new Promise(r => setTimeout(r, 300));
  const afterCopy = await page.evaluate(() => (JSON.parse(localStorage.getItem("route-platform:v1") || "{}").routes || []).length);
  ok(afterCopy === 1, "副本已入 store, n=" + afterCopy);

  // ---- 9. 清理副本，准备功能迭代场景（改名/拖拽/预设） ----
  const cid2 = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("route-platform:v1") || "{}");
    return (s.routes || [])[0] ? s.routes[0].id : null;
  });
  if (cid2) {
    await page.evaluate(c => deleteRouteAsk(c), cid2);
    await page.evaluate(c => deleteRouteAsk(c), cid2);
    await new Promise(r => setTimeout(r, 200));
  }
  const cleared = await page.evaluate(() => (JSON.parse(localStorage.getItem("route-platform:v1") || "{}").routes || []).length);
  ok(cleared === 0, "清理副本后 store 为空");

  // ---- 10. 新建 3 点路线（day 分布 1/2/2）----
  await page.evaluate(() => openNewEditor());
  await page.evaluate(() => { setDayNum(1); addStop("起点A", 30.0, 102.0); setDayNum(2); addStop("中继B", 30.1, 102.1); addStop("终点C", 30.2, 102.2); });
  await new Promise(r => setTimeout(r, 300));
  const names0 = await page.evaluate(() => edCtx.work.stops.map(s => s.name + "#" + s.day));
  ok(names0.length === 3 && names0[0] === "起点A#1", "新建 3 点, 初始顺序 -> " + JSON.stringify(names0));

  // ---- 11. 行内改名（✎ → 输入 → Enter） ----
  await page.evaluate(() => document.querySelector('#edStops .ed-stop[data-i="1"] button[data-op="rename"]').click());
  await new Promise(r => setTimeout(r, 150));
  const editing = await page.$eval("#edStops", e => !!e.querySelector('.ed-stop.editing input.nm-input')).catch(() => false);
  ok(editing, "点 ✎ 后行内出现输入框");
  await page.evaluate(() => {
    const inp = document.querySelector("#edStops .nm-input");
    inp.value = "中继站B";
    inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 300));
  const renamed = await page.evaluate(() => edCtx.work.stops.map(s => s.name));
  ok(renamed[1] === "中继站B", "Enter 提交后地点改名 -> " + JSON.stringify(renamed));

  // ---- 12. 同天拖拽：把第3点(终点C)拖到第2点上方 ----
  const dndOk = await page.evaluate(() => {
    function fireDrag(srcEl, dstEl, yRatio) {
      const dt = new DataTransfer();
      const base = { bubbles: true, cancelable: true, dataTransfer: dt };
      srcEl.dispatchEvent(new DragEvent("dragstart", base));
      const rect = dstEl.getBoundingClientRect();
      const over = Object.assign({}, base, { clientX: rect.left + 5, clientY: rect.top + rect.height * yRatio });
      dstEl.dispatchEvent(new DragEvent("dragover", over));
      dstEl.dispatchEvent(new DragEvent("drop", over));
      srcEl.dispatchEvent(new DragEvent("dragend", base));
    }
    const src = document.querySelector('#edStops .ed-stop[data-i="2"]');
    const dst = document.querySelector('#edStops .ed-stop[data-i="1"]');
    fireDrag(src, dst, 0.1);
    return edCtx.work.stops.map(s => s.name).join(">");
  });
  ok(dndOk === "起点A>终点C>中继站B", "同天拖拽后顺序互换 -> " + dndOk);

  // ---- 13. 跨天拖拽：终点C 拖到「第1天」标题 = 归入第1天末尾 ----
  const crossOk = await page.evaluate(() => {
    const dt = new DataTransfer();
    const src = document.querySelector('#edStops .ed-stop[data-i="1"]');
    const dst = document.querySelector('.ed-day[data-day="1"]');
    src.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
    const rect = dst.getBoundingClientRect();
    const over = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: rect.left + 5, clientY: rect.top + 2 };
    dst.dispatchEvent(new DragEvent("dragover", over));
    dst.dispatchEvent(new DragEvent("drop", over));
    src.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: dt }));
    return edCtx.work.stops.map(s => s.name + "#" + s.day).join(">");
  });
  ok(crossOk === "起点A#1>终点C#1>中继站B#2", "拖到第1天标题后归入第1天末尾 -> " + crossOk);

  // ---- 14. 预设：选卡片色(第4色) + 标签，保存并校验各展示位 ----
  await page.evaluate(() => {
    document.querySelector('#presetSwatches .swatch[data-c="3"]').click();
    const t = document.getElementById("presetTag");
    t.value = "🚗 测试线";
    t.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("edName").value = "预设测试线";
    document.getElementById("edSave").click();
  });
  await new Promise(r => setTimeout(r, 900));
  const pre = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("route-platform:v1"));
    const r = s.routes[0];
    return { nm: r.name, preset: r.preset };
  });
  ok(pre.nm === "预设测试线" && pre.preset && pre.preset.c === 3 && pre.preset.tag === "🚗 测试线", "预设已随路线保存 -> " + JSON.stringify(pre));
  const btnTxt = await page.evaluate(() => {
    const b = [...document.querySelectorAll(".route-switch .rs-btn")].find(x => x.querySelector(".nm") && x.querySelector(".nm").textContent.indexOf("预设测试线") >= 0);
    return b ? { nm: b.querySelector(".nm").textContent, dot: !!b.querySelector(".pdot") } : null;
  });
  ok(!!btnTxt && btnTxt.dot && btnTxt.nm.indexOf("🚗") >= 0, "侧栏显示标签+色点 -> " + JSON.stringify(btnTxt));
  await page.evaluate(() => showHome());
  await new Promise(r => setTimeout(r, 300));
  const cardTxt = await page.evaluate(() => {
    const c = [...document.querySelectorAll(".home-card")].find(x => (x.querySelector(".nm").textContent || "").indexOf("预设测试线") >= 0);
    return c ? { nm: c.querySelector(".nm").textContent, band: c.querySelector(".band").style.background } : null;
  });
  ok(!!cardTxt && cardTxt.nm.indexOf("🚗") >= 0 && /rgb|#/.test(cardTxt.band), "主页卡片显示标签+预设主色 -> " + JSON.stringify(cardTxt));

  // ---- 15. 渲染新配色路线并截图 ----
  await page.evaluate(() => hideHome());
  const savedId = await page.evaluate(() => JSON.parse(localStorage.getItem("route-platform:v1")).routes[0].id);
  await page.evaluate(i => switchRoute(i), savedId);
  await new Promise(r => setTimeout(r, 1800));
  await page.screenshot({ path: path.join(__dirname, "_shot_platform.png") });

  // ---- 汇总 ----
  const realErrors = errors.filter(e => !/net::|ERR_|Failed to load resource|leaflet.*css/.test(e));
  console.log("\n== 控制台错误(" + errors.length + " 条) ==");
  errors.slice(0, 8).forEach(e => console.log("   " + e.slice(0, 200)));
  if (realErrors.length) console.log("   [注意] 非网络类错误 " + realErrors.length + " 条：\n   " + realErrors.join("\n   "));
  console.log("\n通过 " + (step - fail) + "/" + step + (fail ? "  ⚠ 失败 " + fail + " 项" : " ✓ 全部通过"));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("SMOKE CRASH:", e); process.exit(2); });
