# 线路规划平台（route-planner）

> 自驾路线规划与展示平台：多路线管理、逐日行程、四季壁纸主页（液态玻璃风格）、路线编辑器。线上地址：**https://sunyh-gi.github.io/route-planner/**（GitHub Pages，public 仓 `Sunyh-gi/route-planner`）。

## 快速上手

| 操作 | 方法 |
|---|---|
| 本地预览 | 打开 `线路规划平台.html`（壳）——routes/ 外置数据须同级 |
| 发布 | `node _gh_push.js`（PAT 在 `.gh_token`，不进命令行；无输出+exit0=空跑、幂等、只推变化文件） |
| 发布前检查 | `node _gh_push.js --dry-run`；改 JS 后 `node --check`；回归 `node _smoke.js`（50/50，需 `puppeteer-core` + Edge） |
| 加新路线 | routes/ 下新建 `<id>.js` + catalog.js 注册（参考既有格式） |

## 文件结构（v6.19.2 起只留「线上运行必需 + 发布工具链 + 文档」三类）

```
线路规划\
├── 线路规划平台.html      # 主平台壳（v6.x，单文件内联 CSS/JS）
├── index.html            # Pages 入口，重定向到平台壳
├── routes\               # 路线数据（catalog.js + <id>.js，外置）
├── assets\wp\{season}\   # 四季壁纸 + manifest.js（东八区定季，当季空回落有图季节）
├── assets\lonely-travel-logo-white.png    # 主页 logo
├── _gh_push.js / .gh_token(.example)      # GitHub 推送（⚠ .gh_token 是 PAT，勿外传）
├── _smoke.js             # 冒烟 50 断言（puppeteer + Edge）
├── .tmp\snapshots\       # 发布前自动快照（回滚用，勿删）
├── DEV_NOTES.md / README.md / 项目记忆.md  # 开发笔记与说明
└── docs\日志\            # 2026-07-19 ~ 09-23 全部开发日志（按项目提取）
```

## 架构要点

- **壳与数据分离**：主 HTML 是壳，路线数据在 routes/（catalog.js 索引 + 每条路线一个 js）；**发布/拷贝 HTML+routes 一起**
- 坐标体系 WGS-84（OSM/OSRM 系）；早期腾讯地图数据已迁移
- 主页「四季画廊」：液态玻璃卡片 + 渐隐转场（JS applyHomeFade，rAF，出场 opacity 24%→12% + blur + 位移）；**点 logo 换当季壁纸（隐藏功能）**
- 版本史：v2 架构重构 → v4 移除分享 → v5 上线 Pages → v6 主页+编辑器 → v6.13 四季壁纸 → v6.15 渐隐带 → v6.16 撤回（地形晕渲被否）→ v6.18 移动端只读 / 当季单张壁纸 / 语义 / 可回滚发布 / 交互修复 → v6.18.2 彩色 emoji 图标清理 → v6.18.3 地点详情「出行方式」改文字（驾车/骑马/步行）→ v6.19 路线 Apple 地图式描边（同色系更深细描边）→ v6.19.1 虚线段改方头线帽（保虚线语义）+ 孤儿资源清理 → v6.19.2 清理线上运行无关文件（只留运行必需 + 发布工具链 + 文档）→ v6.20 地点弹窗去掉重复出行方式（名后 `(tag)` 与用时行的 `步行/骑马/驾车` 重复）
- **v6.20 地点弹窗**：地点名后不再重复出行方式——`isModeTag()` 命中 `modeLabel()` 三值（步行/骑马/驾车）时，`popupHtmlFor` 不渲染名后的 `(tag)`；该方式已在「上段/下段」用时行（`X km` 与 `分钟` 之间）显示。`折返`/`返程` 等非出行方式标注照常保留。侧栏不显示地点 tag（v6 侧栏由 `renderWpList()` 独占，只渲染序号 + 名称），故无需同步改动
- **v6.19 路线描边**：每条路线先铺同色系深色底线、再叠亮色主线，形成 Apple 地图式细描边；颜色由 `caseColor()` 从当日色保色相降明度得到。虚线段用 `lineCap:"butt"`——圆头会外扩半个线宽把 7px 空隙糊成实线
- **v6.18 可回滚发布**：`node _gh_push.js` 发布前自动快照远端旧内容到 `.tmp/snapshots/<时间戳>/`（含 manifest + 原 sha），逐文件落盘；内容一致自动跳过；发布后回读校验 sha 与逐字节内容；`--rollback [时间戳]` 回滚、`--snapshots` 列出快照（回滚前会再存一份当前远端，回滚本身也可回滚）

## 详细历史

- `docs\日志\` 下 9 个整日日志 + 09-23 的 9 个小节（壁纸系列 / 仓库审计等）
