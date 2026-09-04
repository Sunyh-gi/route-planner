# 路线规划平台（Route Planner）

基于 Leaflet 的「**壳 + 外置数据**」路线规划平台。HTML 本体不携带任何路线数据（约 110 KB），内置路线以独立数据文件存于 `routes/` 目录；**v6 起界面范式改为「主页选择进入 + 侧栏内联编辑器」**：打开先看到路线库画廊，点哪张卡进入路线界面后直接在地图侧栏里搜地名 / GPS 加站、改名、拖拽换天，无需任何 modal / 弹窗。GitHub 仓库是路线真源，每条路线 = 各自一份 `routes/<id>.js` + 共享目录 `routes/catalog.js`，多设备多浏览器打开即见最新。

## 架构：壳与数据分离（v5）

```
index.html              ← 站点入口：根路径自动跳转到平台页（GitHub Pages / 本地双击均可用）
线路规划平台.html     ← 平台壳（渲染器 + 主页 + 侧栏内联编辑器，无路线数据）
routes/
  catalog.js          ← 路线目录：ROUTE_CATALOG（id/名称/数据文件/天数/点数/主色）
                        + ROUTE_PLACES（内置地名库，搜索用）
  cx.js               ← 川西路线数据（window.ROUTE_PACKS.cx，坐标已预转 WGS-84）
  yl.js               ← 伊犁环线数据（window.ROUTE_PACKS.yl）
```

- 打开先展示「路线库画廊」主页；点哪张卡按 `catalog.js` 里 `file` 字段**动态注入 `<script>` 加载该路线文件**（`file://` 与在线部署均可用，无需 CORS），首次加载后缓存于内存
- 新增一条路线：写好 `routes/<id>.js`（格式见下）+ 在 `catalog.js` 登记一条即可，无需改动 HTML
- 修改路线数据（坐标 / 天数 / 轨迹缓存）：直接编辑对应 `routes/*.js`，平台侧零改动

## v6 界面范式

**首屏只有三件套**（全部在主页，只有进入路线界面才看到编辑器）：

| 位置 | 元素 |
|---|---|
| 主页顶部 | ＋ 新建路线 / ⚙ 设置（高德 Key / GitHub 同步）/ 🔄 刷新 |
| 路线界面侧栏 | 路线名（点可改） / 搜索栏 + 搜索按钮 / 第N天按钮 / 各天及地点详情（行内 ✎ 改名 / ↑↓ 换位 / ◀▶ 换天 / ✕ 删除 / 拖拽换天）/ 保存按钮（dirty 时亮） |

- v5「侧栏路线列表 + 弹窗编辑器」已彻底移除：弹窗编辑 modal、模态遮罩、edName / edTitle / edImport / edExport 等 DOM 与 JS 全部下线
- v5「侧栏工具」按钮（新建 / 设置 / 刷新）已全部迁移到主页；路线界面里只关心当前这一条
- 侧栏不显示「当前共 N 条路线」之类元信息：用户从主页点进来的，已知在编辑哪条
- 路线头部右上角 ⋯ 菜单保留三个动作：📋 复制为新路线 / 🗑️ 删除路线 / ⌂ 回到主页
- 数据真相不变：仓库是唯一真源；保存 / 刷新 / 迁移所有写入路径同下

## v5 统一模型：仓库文件为唯一真源

旧版「内置 / 自定义 / 远端」三分已取消；**所有路线同权，来源无关**：

- 站点自带的川西、伊犁同样以 `routes/cx.js` / `routes/yl.js` 数据文件存在，本质和用户新建的路线完全一样（只是发布在仓库里随站点一起走）
- 你在侧栏编辑器里新建 / 修改 / 复制的路线，点「保存」就会 `PUT routes/<id>.js` + `PUT routes/catalog.js`（带 sha 覆盖，先读后写）写回仓库
- 删除走 `DELETE routes/<id>.js` + 推一次目录更新
- 旧版遗留的 localStorage 路线（v5 之前的 `route-platform:v1.routes` 数组）通过设置面板的 **「⇪ 迁移旧路线」** 按钮一键逐条入库，然后清空本地旧库
- 无 Token 时点保存 / 删除会被拦截（弹设置引导），只读浏览和编辑都可以
- 启动后若已配置 Token 会自动 `refreshFromRepo()` 把远端目录同步到本地

```
              ┌──────────────────────────┐
              │  GitHub 仓库（真源）        │
              │   routes/catalog.js       │ ← 目录索引（每次写路线都会顺手更新）
              │   routes/<id>.js          │ ← 每条路线的数据文件
              └──────────┬───────────────┘
                         │ Contents API
              ┌──────────▼───────────────┐
              │  本机浏览器               │
              │   ROUTE_CATALOG 同步镜像   │
              │   ROUTE_PACKS   按需加载   │
              │   localStorage 仅保存：    │
              │     - 设置（Token/Key）    │
              │     - 离线快照缓存（只读）  │
              └──────────────────────────┘
```

## 内置路线

| 路线 | 天数 / 点数 | 特点 |
|---|---|---|
| 川西路线 | 2 天 11 点 | 成都 → 四姑娘山 → 丹巴 → 新都桥 → 甲根坝 → 观德结折返（第 1 天去程 / 第 2 天返程） |
| 伊犁环线（夏） | 8 天 21 点 | 乌鲁木齐 → 赛里木湖 → 伊昭公路 → 夏塔 → 琼库什台 → 那拉提 → 独库公路（步行 / 骑马段虚线 + 🚶 / 🚲 图标） |

## 功能

- **🏠 主页画廊**：打开平台先看到一张全屏主页，列出全部路线卡片；每张卡显示路线名 / 天数 / 点数 / 各天配色，无任何「内置」徽章。顶部三件套：＋ 新建路线 / ⚙ 设置 / 🔄 刷新
- **路线界面**：进入后侧栏即编辑器——顶部当前路线名（点击可改名）+ 搜索栏（地名 / GPS）+ 第N天按钮（− / ＋）+ 「＋ 第N天」加站按钮 + 各天分组与地点详情 + 底部「保存」按钮（dirty 时高亮）。行内操作：✎ 改名、↑↓ 同天前移 / 后移、◀▶ 前一天 / 后一天、✕ 删除；整行可拖拽换位 / 换天（拖到某行上下半 = 插其前后并跟随该天，拖到「第 N 天」标题 = 移到该天末尾）
- **⋯ 头部菜单**：📋 复制为新路线 / 🗑️ 删除路线（删除需二次确认并消耗一次仓库写入）/ ⌂ 回到主页
- **加站方式（v6.1：地图旁液态玻璃卡片）**：搜索（地名 / GPS）结果行点击，或直接点地图空白 → 在该坐标放青色「＋」预览 marker，地图上该 marker **右侧**弹出液态玻璃半透明卡片「添加到第几天？」；卡片列出 1..maxDay+1 的 day chips（当前 stepper 选的天高亮），点某 chip 即把该点加入对应天；GPS 坐标与点击已有路线 marker 旁的预览点同理。卡片底部「点地图可换位置」可重新点击地图换坐标；「取消」移除预览点不加入
- **按天编排**：每个地点归属具体某一天，地点按天自动排序，段路径颜色取自全局 30 色高对比色彩库 `DAY_PALETTE`（专为卫星底图优化）
- **路径规划**：相邻地点通过 OSRM 公共接口浏览器端自动补全驾车路径（2 路并发、按坐标 key 缓存），失败时保留虚线占位；编辑时改了地点会触发对应段路径刷新
- **数据持久化**：localStorage 仅保存设置（`route-platform:v1` 的 `amapKey`/`gh`）与离线快照缓存（`route-platform:v1:cache`，只在弱网 / 离线时做兜底，**不是真源**）；真源始终在 GitHub 仓库
- **导入**：编辑面板「导入备份」（`fileImport` 触发）打包全部路线为 JSON 后逐条 `PUT` 进仓库（需 Token）
- **☁ GitHub 真源**（v5 必选）：在 ⚙ 设置 填 GitHub Token + 仓库 owner/repo，保存 / 删除 / 导入 / 远端刷新 / 迁移旧路线 全部走 Contents API 写入仓库；启动自动刷新，弱网靠本地缓存兜底
- **底图**：标准 / 地形 / 卫星 / OpenStreetMap / National Geographic 五套底图 + 天地图中文注记叠加层（卫星模式下面板文字自动变白）

## 使用

把整个目录保持原样即可打开 / 部署（HTML + `routes/` 同目录）：

- 本地：双击 `线路规划平台.html`（`file://` 下通过相对路径加载 `routes/*.js`，无需起服务）
- **线上直链：https://sunyh-gi.github.io/route-planner/（本仓库公开，GitHub Pages 自动托管 main 分支；根路径经 index.html 跳转到平台页）**
- 线上（自托管）：把 `线路规划平台.html` 与 `routes/` 一起发布（EdgeOne Pages / WorkBuddy「发布为应用」/ 任意静态托管）
- ⚠ 不要把 HTML 单独拷走，否则 `routes/catalog.js` 与 `routes/*.js` 缺失，主页为空

## 外置路线数据格式（routes/<id>.js）

```js
(function(){window.ROUTE_PACKS=window.ROUTE_PACKS||{};window.ROUTE_PACKS["<id>"]={
  id: "<id>",
  name: "显示名",
  stops: [ { name: "乌鲁木齐", lat: 43.91279, lng: 87.46644, day: 1, tag: "" }, ... ],
  segs: {
    "43.91279,87.46644|44.97102,81.02588": { d: 581929, m: 396, poly: [ [lat,lng], ... ] }
    // 可选 p: "foot" | "cycling" —— 该段画虚线并显示 🚶/🚲 图标
  },
  preset: { c: 0, tag: "⛰️" }    // 可选：c = 30 色索引；tag ≤ 8 字符标签
};})();
```

平台内部一律通过 `routeFileText(r)` 序列化此格式（写入仓库）；`routeObjForFile(r)` 是对应规范化版本。

> 坐标统一 WGS-84（GCJ-02 采集的源数据需先转换，见川西 cx.js 的生成流程）；`stops` 的 key 由相邻两点经纬度 `toFixed(5)` 拼接；`poly` 为该段 OSRM 完整轨迹缓存（无缓存也能画虚线并在线补全）。

## 地名搜索 Key（可选）

高德 Web 服务 Key 用于全国地名搜索：

1. 打开 [console.amap.com](https://console.amap.com) → 应用管理 → 创建应用 → 添加 Key，类型选「Web 服务」
2. 在平台内 ⚙ 设置 中粘贴 Key 保存
3. 浏览器端直接调用（高德允许 CORS），坐标自动由 GCJ-02 转为 WGS-84

> Key 仅保存在本机浏览器 localStorage，不上传 GitHub；无 Key 时可用内置路线出现过的地名离线匹配（`routes/catalog.js` 里的 `ROUTE_PLACES`）。

## ☁ GitHub 真源（v5，需要 Token）

`routes/catalog.js` 是仓库里全部路线的目录索引；每条路线对应一个 `routes/<id>.js` 数据文件。**所有写入都自动更新 catalog**：

1. github.com → Settings → Developer settings → Personal access tokens → classic 或 fine-grained，**勾 `repo` 权限**（写文件 + 读文件）
2. 在本平台 ⚙ 设置 → **GitHub Token** 框粘贴 PAT → 点「保存」

> 设置面板默认同步到 `Sunyh-gi/route-planner#main`，若需换仓库点该标签右侧的 `✎` 弹输入框修改（支持 `owner/repo@分支` 格式）

3. 点「测试」→ 远端目录存在则 toast 显示条目数，不存在则提示「保存任意路线时会自动创建」
4. **保存**：`PUT routes/<id>.js` + `PUT routes/catalog.js`（带 sha 覆盖，先读后写）
5. **删除**：`DELETE routes/<id>.js` + `PUT routes/catalog.js`（删除项已摘除）
6. **🔄 刷新**（主页按钮）：从仓库拉 catalog.js，按需补拉本机没有的路线文件（站点自带的川西/伊犁按本机目录算作「已发布」不会重复拉取）
7. **⇪ 迁移旧路线**：v5 之前存在 localStorage `route-platform:v1.routes` 的路线，逐条 `PUT routes/<id>.js` 入库，最后推一次 catalog 并清空旧库
8. 启动时若已配置 Token 会自动 `refreshFromRepo()`；失败时降级使用本地缓存

> 多电脑工作：每台机都填同样的 Token 即可双向同步。Token 只在本机 localStorage，不上传 GitHub；可在 github.com 随时撤销。

## 验证

- `_smoke.js`：双阶段冒烟（puppeteer-core + 系统 Edge，`file://` 直开场景）
  - **阶段 A**（12 项，无 Token 只读）：主页画廊两张卡无徽章 / 目录已注册 / 主页三件套（新建 / 设置 / 刷新） / 懒加载 cx 11 点 / 侧栏有保存/搜索、无旧 rs-tools / 本地搜索 + 第N天按钮文案 / 加站 12 点 / 两天 / dirty / 菜单三件套（复制 / 删除 / 主页） / 无 Token 保存拦截 / 无 Token 删除拦截 / 回到主页侧栏重置
  - **阶段 B**（11 项，mock fetch api.github.com）：注入仓库配置 / 保存 PUT 路线文件 + catalog / 侧栏 dirty 清 / 改名带 sha 覆盖 / DELETE + 推目录回 cx,yl / 复制预填 dirty=true / 远端刷新拉取新路线 / 旧路线迁移入库 + 清空本地 / 主页 4 卡 + 截屏
  - 全部断言：**24 / 24 通过**，控制台 0 报错
  - 阶段 B 在浏览器内拦截 `api.github.com` 与 OSRM/高德外呼，**完全不接触真实网络**，可重复回归
  - 阶段 A 也对 OSRM/高德做了 `Promise.reject` 短路，避免沙箱环境真实网络挂起拖垮 headless 渲染进程

## 技术要点

- 30 色 `DAY_PALETTE` 为全局唯一色彩真源：**色轮柔和蓝 (h=214°) → 柔和紫 (h=286°) 连贯平滑过渡**，饱和 S≈0.48、明度 L 沿正弦在 0.56–0.63 之间起伏，两端略深中段略浅，玻璃底色上既清晰不刺眼又具备 30 色渐变层次；图钉/序号文字按底色亮度自适应（`fgOn`/`darkOnLight`）
- HTML 为壳（~110 KB），内置路线数据全部外置到 `routes/*.js`；点击卡片经 `loadRouteData()` 动态 `<script>` 注入加载（file:// 与 http 双通）
- 川西历史坐标采集自 GCJ-02 图源，已在生成 `routes/cx.js` 时预转 WGS-84；伊犁 / OSM / OSRM 原生 WGS-84
- 通用路线数据模型：`{id, name, stops:[{name,lat,lng,day,tag}], segs:{segKey:{d,m,poly[,p]}}, preset?}`；`p: foot/cycling` 段画虚线并换 🚶/🚲 图标
- GitHub 真源：单条路线一个文件 + 共享目录 `routes/catalog.js`；走 Contents API REST；写请求带 `Authorization: Bearer <Token>`；写文件前先 GET 取 sha 实现「先读后写」覆盖；启动自动 refresh + 离线快照缓存兜底
- v6 侧栏编辑器统一渲染：`applyEditToMap()` = `renderGeneric()`（地图层） + `applyRoute(obj, true, true)`（不覆盖侧栏） + `renderWpList()`（侧栏行内编辑器）；任何数据变更（加站 / 行内操作 / 改名 / 拖拽）都走同一条同步路径
- v6 顶部 ⋯ 菜单：复制 / 删除 / 主页三个动作；复制与删除仅当 `activeRouteId` 非空时启用
- v6 行内改名输入 → 恢复 span 时必须重建 `<span id="routeName" class="nm">` 再 `inp.replaceWith(span)` 再 `renderRouteHeader()`；否则 `renderRouteHeader()` 找不到被顶替的原 span，抛空指针并导致路线名永久丢失
- v6 修复（由 `_smoke.js` 阶段 A 暴露）：v5 遗留的 `routeSwitch.appendChild` 块在 v6 DOM 下抛 `Cannot read properties of null` 且中断同一 script 后续 top-level 执行（飞往点击委托根本没绑上）。修法：删掉整段 rs-btn 生成代码，启动时显式 `rebuildMeta()` 让画廊正常出卡
- v6.1 地图旁液态玻璃加站卡片：搜索 / GPS / 点图均统一走 `openDayCard()`（半透明青色「＋」预览 marker + Leaflet popup 内嵌液态玻璃 `.day-card`，含 1..maxDay+1 day chips）；预览点 divIcon 自定义 `popupAnchor: [28, -20]` 让 popup tip 朝向 marker 右侧中段，卡片自然落在点的右边；`.map-dark` 切换暗玻璃变体（卫星 / NatGeo 等深色底图），由 `baselayerchange` 同步 toggle `#map.map-dark` 与 `.info-panel.sat-active`
- 编辑器保存 / 删除均通过统一的 `saveRouteToRepo` / `doDeleteRoute` 函数；中途抛错会被 catch 并 toast 失败原因，编辑器保持打开便于排查
- v5 修复（由 `_smoke.js` 阶段 B 暴露）：`rebuildRouteList` 在带预设（颜色 / 标签）的路线上原先调用 `btn.insertBefore(pdot, nm)` 时 `nm` 还未插入 `btn`，会触发 `The node before which the new node is to be inserted is not a child of this node`，导致保存后侧栏列表构建失败、回退显示「保存失败」。修复方式：先 `btn.appendChild(nm)` 再 `btn.insertBefore(pdot, nm)`。