# 路线规划平台（Route Planner）

基于 Leaflet 的**壳 + 外置数据**路线规划平台：HTML 本体不携带任何路线数据（约 109 KB），内置路线以独立数据文件存于 `routes/` 目录；开机看到「路线库画廊」主页，**点哪张卡，按需加载该路线数据并渲染到地图**。路线支持新建/编辑、按地名或 GPS 加站、按天分组取色，可通过 GitHub 同步多设备恢复。

## 架构：壳与数据分离

```
index.html            ← 站点入口：根路径自动跳转到平台页（GitHub Pages / 本地双击均可用）
线路规划平台.html   ← 平台壳（渲染器 + 编辑器 + 画廊，无路线数据）
routes/
  catalog.js        ← 路线目录：ROUTE_CATALOG（id/名称/数据文件/天数/点数/主色）+ ROUTE_PLACES（内置地名库，搜索用）
  cx.js             ← 川西路线数据（window.ROUTE_PACKS.cx，坐标已预转 WGS-84）
  yl.js             ← 伊犁环线数据（window.ROUTE_PACKS.yl）
```

- 点击主页卡片或侧栏内置路线时，平台按 `catalog.js` 里的 `file` 字段**动态注入 `<script>` 加载对应数据文件**（`file://` 与在线部署均可用，无需 CORS 配置），首次加载后缓存于内存
- 新增一条内置路线：写好 `routes/xxx.js`（格式见下）+ 在 `catalog.js` 登记一条即可，无需改动 HTML
- 修改路线数据（坐标 / 天数 / 轨迹缓存）：直接编辑对应 `routes/*.js`，平台侧零改动

## 内置路线

| 路线 | 天数/点数 | 特点 |
|---|---|---|
| 川西路线 | 2 天 11 点 | 成都 → 四姑娘山 → 丹巴 → 新都桥 → 甲根坝 → 观德结折返（第 1 天去程 / 第 2 天返程） |
| 伊犁环线（夏） | 8 天 21 点 | 乌鲁木齐 → 赛里木湖 → 伊昭公路 → 夏塔 → 琼库什台 → 那拉提 → 独库公路（步行/骑马段虚线 + 🚶/🚲 图标） |

## 功能

- **🏠 主页画廊**：打开平台先看到一张全屏主页，列出全部路线（内置目录 + 你的自定义 + GitHub 同步来的）卡片，点击进入任一地图
- **路线管理**：切换内置路线；复制内置路线为可编辑副本；新建 / 修改 / 删除自定义路线
- **加站方式**：输入地名（内置地点库 + 高德 Web 服务全国搜索）或直接粘贴 GPS 坐标（自动识别"纬度,经度 / 经度,纬度"两种顺序）
- **按天编排**：每个地点归属具体某一天，地点按天自动排序，段路径颜色取自全局 30 色高对比色彩库 `DAY_PALETTE`（专为卫星底图优化，亮色文字自动配深色底确保可读）
- **地点微调**（编辑器内）：✎ 行内改名、整行拖拽换位 / 换天（拖到某行上/下半=插其前/后并跟随该天，拖到「第 N 天」标题=移到该天末尾），旧按钮 ↑↓◀▶✕ 在移动端仍可作兜底
- **路线预设**（路线级）：🎨 卡片色（30 色 swatch 一键选）+ 标签（如 ⛰️ 雪山）；主页卡片顶部 band 色与名称前标签随预设变化，侧栏路线按钮也会显示对应色点
- **路径规划**：相邻地点通过 OSRM 公共接口浏览器端自动补全驾车路径（2 路并发、按坐标 key 缓存），失败时保留虚线占位
- **数据持久化**：所有自定义路线保存在浏览器 localStorage（`route-platform:v1`），支持 JSON 导出 / 导入备份
- **☁ GitHub 同步**（推荐）：在设置里填 GitHub Token + 仓库 owner/repo，本机保存路线时自动 push 到仓库 `routes/route-library.json`（多设备恢复）；换电脑时启动时自动 pull 合并最新路线库。Token 需 `repo` 权限，仅存本机
- **底图**：标准 / 地形 / 卫星 / OpenStreetMap / National Geographic 五套底图 + 天地图中文注记叠加层（卫星模式下面板文字自动变白）

## 使用

把整个目录保持原样即可打开/部署（HTML + `routes/` 同目录）：

- 本地：双击 `线路规划平台.html`（`file://` 下通过相对路径加载 `routes/*.js`，无需起服务）
- **线上直链：https://sunyh-gi.github.io/route-planner/（本仓库公开，GitHub Pages 自动托管 main 分支；根路径经 index.html 跳转到平台页）**
- 线上（自托管）：把 `线路规划平台.html` 与 `routes/` 一起发布（EdgeOne Pages / WorkBuddy「发布为应用」/ 任意静态托管）
- ⚠ 不要把 HTML 单独拷走，否则内置路线目录与数据缺失，主页只剩自定义路线

## 外置路线数据格式（routes/xxx.js）

```js
window.ROUTE_PACKS = window.ROUTE_PACKS || {};
window.ROUTE_PACKS.yl = {
  id: "yl", name: "伊犁环线（夏）",
  stops: [ { name: "乌鲁木齐", lat: 43.91279, lng: 87.46644, day: 1, tag: "" }, ... ],
  segs: {
    "43.91279,87.46644|44.97102,81.02588": { d: 581929, m: 396, poly: [ [lat,lng], ... ] }
    // 可选 p: "foot" | "cycling" —— 该段画虚线并显示 🚶/🚲 图标
  }
};
```

> 坐标统一 WGS-84（GCJ-02 采集的源数据需先转换，见川西 cx.js 的生成流程）；`stops` 的 key 由相邻两点经纬度 `toFixed(5)` 拼接，`poly` 为该段 OSRM 完整轨迹缓存（无缓存也能画虚线并在线补全）。

> 多设备自用：在 ⚙ GitHub 同步里填一次 Token + 仓库，换电脑登录任意浏览器都能拉回你的路线库。

## 地名搜索 Key（可选）

高德 Web 服务 Key 用于全国地名搜索：

1. 打开 [console.amap.com](https://console.amap.com) → 应用管理 → 创建应用 → 添加 Key，类型选「Web 服务」
2. 在平台内 ⚙ 设置 中粘贴 Key 保存
3. 浏览器端直接调用（高德允许 CORS），坐标自动由 GCJ-02 转为 WGS-84

> Key 仅保存在本机浏览器 localStorage，不上传 GitHub；无 Key 时可用内置路线出现过的地名离线匹配。

## ☁ GitHub 同步（推荐，需要 Token）

把全部自定义路线备份到 GitHub 仓库（换电脑/换浏览器自动恢复）：

1. github.com → Settings → Developer settings → Personal access tokens → 选 **Fine-grained** 或 classic token，**勾 `repo`**（写文件 + 读文件权限）
2. 在本平台 ⚙ 设置 → **GitHub Token** 框粘贴 PAT → 点「保存」

> 设置面板默认同步到 `Sunyh-gi/route-planner#main`，若需换仓库点该标签右侧的 `✎` 弹输入框修改（支持 `owner/repo@分支` 格式）

3. 点「测试」→ 远端路线库存在则 toast 显示数量，不存在则提示上传时新建
4. 本机后续每次保存路线 → 防抖 900ms 自动 push；启动时自动 pull 合并（`ver` 时间戳大者胜，覆盖前本地备份到 `route-platform:v1:backup`）

> 多电脑工作：每台机都填同样的 Token 即可双向同步。Token 只在本机 localStorage，不上传 GitHub；可在 github.com 随时撤销。

## 验证

- `_smoke.js`：壳 + 懒加载 + 编辑器核心链路冒烟（puppeteer-core + 系统 Edge，file:// 直开场景），26/26 断言全过

## 技术要点

- 30 色 `DAY_PALETTE` 为全局唯一色彩真源（600/700 宝石色，卫星底图清晰不刺眼）；图钉/序号文字按底色亮度自适应（`fgOn`/`darkOnLight`）
- HTML 为壳（~109 KB），内置路线数据全部外置到 `routes/*.js`；点击卡片经 `loadRouteData()` 动态 `<script>` 注入加载（file:// 与 http 双通）
- 川西历史坐标采集自 GCJ-02 图源，已在生成 `routes/cx.js` 时预转 WGS-84；伊犁 / OSM / OSRM 原生 WGS-84
- 通用路线数据模型：`{id, name, stops:[{name,lat,lng,day,tag}], segs:{segKey:{d,m,poly[,p]}}}`；`p: foot/cycling` 段画虚线并换 🚶/🚲 图标
- GitHub 同步：单文档 `routes/route-library.json`（`{routes, ver, updatedAt}`）；走 Contents API REST；`ver` 时间戳大者胜合并（覆盖前本地备份到 `route-platform:v1:backup`）；写请求带 `Authorization: Bearer <Token>`，读取私有仓库也需 Token（公开仓库只读无需 Token）