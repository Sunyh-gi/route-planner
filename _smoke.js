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

  // ---- 1. 初始状态 ----
  const btns = await page.$$eval(".route-switch .rs-btn", els => els.map(e => e.getAttribute("data-route")));
  ok(btns.includes("cx") && btns.includes("yl"), "初始按钮包含 cx/yl -> " + btns.join(","));
  const active = await page.$eval(".route-switch .rs-btn.active", e => e.getAttribute("data-route")).catch(() => null);
  ok(active === "cx", "默认激活路线 cx, actual=" + active);
  const wpItems = await page.$$eval("#wpList .wp-item", els => els.length).catch(() => -1);
  ok(wpItems > 0, "侧栏已渲染地点列表, n=" + wpItems);
  const mapCx = await page.evaluate(() => !!window.map && !!window.CX && !!window.YL);
  ok(mapCx, "window.map/CX/YL 可用");

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

  // ---- 截图 ----
  await page.evaluate(() => switchRoute("cx"));
  await new Promise(r => setTimeout(r, 1200));
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
