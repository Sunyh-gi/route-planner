# 路线规划平台（Route Planner）

基于 Leaflet 的单文件可编辑路线规划平台：内置川西 / 伊犁两条自驾线路，开机即看到「路线库画廊」主页，**点哪张卡进哪张图**；路线支持在线新建/编辑、按地名或 GPS 加站、按天分组取色，可通过 GitHub 同步多设备恢复、单条路线一键分享。

## 内置路线

| 路线 | 天数 | 特点 |
|---|---|---|
| 川西路线 | 去程 + 折返 5 段 | 成都 → 四姑娘山 → 丹巴 → 新都桥 → 甲根坝 → 观德结折返（含往返点标记） |
| 伊犁环线（夏） | 8 天 21 点 | 乌鲁木齐 → 赛里木湖 → 伊昭公路 → 夏塔 → 琼库什台 → 那拉提 → 独库公路（含步行/骑马段虚线） |

## 功能

- **🏠 主页画廊**：打开平台先看到一张全屏主页，列出全部路线（内置 + 你的自定义 + GitHub 同步来的）卡片，点击进入任一地图
- **路线管理**：切换内置路线；复制内置路线为可编辑副本；新建 / 修改 / 删除自定义路线
- **加站方式**：输入地名（内置地点库 + 高德 Web 服务全国搜索）或直接粘贴 GPS 坐标（自动识别"纬度,经度 / 经度,纬度"两种顺序）
- **按天编排**：每个地点归属具体某一天，地点按天自动排序，段路径颜色取自全局 30 色莫兰迪色彩库 `DAY_PALETTE`（第 N 天取第 N 色）
- **路径规划**：相邻地点通过 OSRM 公共接口浏览器端自动补全驾车路径（2 路并发、按坐标 key 缓存），失败时保留虚线占位
- **数据持久化**：所有自定义路线保存在浏览器 localStorage（`route-platform:v1`），支持 JSON 导出 / 导入备份
- **🔗 一键分享**：把某条路线压缩编码进 URL（`#r=` 参数），发给朋友打开链接即自动加载展示；幂等去重、打开后自动清除参数
- **☁ GitHub 同步**（推荐）：在设置里填 GitHub Token + 仓库 owner/repo，本机保存路线时自动 push 到仓库 `routes/route-library.json`（多设备恢复）；换电脑时启动时自动 pull 合并最新路线库。Token 需 `repo` 权限，仅存本机
- **底图**：标准 / 地形 / 卫星 / OpenStreetMap / National Geographic 五套底图 + 天地图中文注记叠加层（卫星模式下面板文字自动变白）

## 使用

直接用浏览器打开 `线路规划平台.html` 即可（单文件，无构建步骤；图标已内嵌，不依赖外部资源文件）。

> 分享给朋友：先把 HTML 部署成在线地址（EdgeOne Pages / WorkBuddy「发布为应用」），再用单条路线的 🔗 分享链接即可，朋友打开自动加载该路线。
>
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

- `_smoke.js`：编辑器核心链路冒烟（puppeteer-core + 系统 Edge），16/16 断言全过
- `_share_test.js`：分享链接端到端（生成 → 隔离浏览器自动加载 → 幂等 → 损坏容错），9/9（需本地启动 `python -m http.server 8791`）

## 技术要点

- 30 色 `DAY_PALETTE` 为全局唯一色彩真源；伊犁原 8 日配色与其前 8 色逐一对应
- 川西历史坐标采集自 GCJ-02 图源，渲染前经内置 `gcj02towgs84` 转换；伊犁 / OSM / OSRM 为 WGS-84
- 自定义路线数据模型：`{id, name, stops:[{name,lat,lng,day,tag}], segs:{segKey:{d,m,poly}}}`
- 分享链接：`CompressionStream('deflate')` 压缩仅含地点的 JSON → base64url，伊犁 21 点约 760 字符
- GitHub 同步：单文档 `routes/route-library.json`（`{routes, ver, updatedAt}`）；走 Contents API REST；`ver` 时间戳大者胜合并（覆盖前本地备份到 `route-platform:v1:backup`）；写请求带 `Authorization: Bearer <Token>`，读取私有仓库也需 Token