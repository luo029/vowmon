# Vowmon Wiki · AI 总纲

> **本文档是给 AI 看的**。目标：任何 AI（换了模型、换了人、新开对话）读完这一份文件，
> 就能立刻接手这个项目的**代码、数据、世界观设定与工作习惯**，不需要重新摸索。
>
> 配套文件：`README.md`（面向使用者的详细功能手册与开发规范，本文有大量引用）。
> 两者冲突时，以**仓库实际代码**为准，其次本文，再次 README（README 个别目录描述已过时，见 §0.3）。

---

## 0. 快速开始（30 秒版本）

```text
项目     = 一个"御兽精灵"题材的小说设定 Wiki + 数据管理后台（纯静态，无后端服务器）
代码仓库 = D:/novels/vowmon        → github.com/luo029/vowmon      （站点本体，不含数据）
数据仓库 = D:/novels/vowmon_data   → github.com/luo029/vowmon_data （唯一数据源，11 个 JSON）
图片仓库 =                            github.com/luo029/vowmon_imgs （按编号命名的 PNG）
线上主站 = https://vowmon.pages.dev/（Cloudflare Pages，push 自动部署）
备用镜像 = https://luo029.github.io/vowmon/（GitHub Pages，301 到自定义域名）
技术栈   = 原生 HTML + Vue3 CDN 生产版（运行时编译内联模板）+ Font Awesome 6.4，零构建零打包
数据流   = 后台页面改 localStorage 镜像 → 一键同步推 JSON 到 vowmon_data → 前台 /data/* 反代（60s 缓存）读取
```

**AI 接手任何任务前必读的硬规范**（详见 README §「核心开发规范」+ §13 踩坑史）：

1. 「精灵」英文统一 **Vowmon**，图鉴英文 **Vowdex**。禁止 Pokemon / Pokedex / pet(s) 作为对外名称。
2. 给用户的代码输出必须用 ` ```text ` 代码块、无高亮、无省略号，文件名写在代码块上方。
3. **改完立即提交推送**，用户偏好"推送完毕就结束任务"。
4. 组件本身有问题要修组件文件，不要在页面里打补丁。
5. 用户质疑"不生效"时必须实测查到根因，不许口头解释了事（用户会明确授权实测）。
6. 每次 css/js 改动必须升 `?v=YYYYMMDD[字母]` 版本号，否则缓存错位白屏。

---

## 1. 三个仓库的分工（硬约定）

| 仓库 | 本地路径 | 内容 | 谁读 |
|---|---|---|---|
| `vowmon` | D:/novels/vowmon | HTML/CSS/JS + `functions/`，**禁止放数据**（`data/` 目录已删除） | CF Pages / GH Pages |
| `vowmon_data` | D:/novels/vowmon_data | 仓库根目录 11 个 JSON（唯一数据源） | 前台运行时拉取、后台读写 |
| `vowmon_imgs` | — | `sprites/{编号}.png`、`sprites/{编号}_s.png`（异色）、`items/{id}.png` | 前台经 `/img/*` 反代 |

数据仓库文件清单（**新增文件必须同步进本清单**）：

| 文件 | 结构 | 全局变量 | 内容 |
|---|---|---|---|
| `vow-data.json` | `{vows[]}` | `allVowsData` | 精灵种族（图鉴） |
| `skills-data.json` | `{skills[]}` | `allSkillsData` | 技能 |
| `traits-data.json` | `{traits[]}` | `allTraitsData` | 特性 |
| `items-data.json` | `{kinds,groups,categories,currencies,items}` | `allItemsData` 等 | 物品（当前 items 为空数组，结构保留） |
| `natures-data.json` | `{natures[],stats}` | `allNaturesData` | 25 性格（宝可梦口径，只读，后台不覆盖） |
| `stages-data.json` | `{stages[]}` | `allStagesData` | 阶段境界八阶表（可后台自定义） |
| `individuals-data.json` | `{individuals[],fieldTemplates[]}` | `allIndividualsData` | 书内御兽精灵个体 |
| `characters-data.json` | `{characters[],factions,groups,fieldTemplates[]}` | `allCharactersData` | 书内御兽人物 |
| `bloodline-skills-data.json` | `{skills[],families{}}` | — | 血脉技能（如「本心一击」）+ 族群技能包 |
| `lore-data.json` | `{pages[],blocks{}}` | `allLoreBlocks` | 世界观五页正文文本块（键 `页.c序`，382 块） |
| `realm-data.json` | `{labels{},descs{}}` | — | 天地图鉴四类精灵定位的名称与描述 |

当前数据规模：16 精灵 / 2 技能 / 1 特性 / 25 性格 / 8 境界 / 1 个体 / 1 人物 / 18 血脉技能 / 382 文本块。**站点按千只规模设计压测过**，别担心容量，只 worry 缓存和分页（README §3）。

---

## 2. 目录结构与文件清单（以实际仓库为准）

```text
vowmon/
├── index.html / 404.html
├── dex/        vowdex.html（精灵图鉴）  list.html（列表）  vow-detail.html（精灵详情）
│               realm-dex.html（天地图鉴：权柄/遥世/伙伴/晚熟四类定位）
├── records/    individuals.html（御兽精灵个体）  characters.html（御兽人物）
├── reference/  skills.html  skill-detail.html  traits.html  natures.html
│               items.html  calculator.html（克制计算器）  coverage.html（打击面）
│               bloodlines.html（血脉图鉴，世界观页但在 reference/ 目录）
├── world/      ranks.html（等级体系）  trainers.html（御兽师图鉴）
│               factions.html（势力版图）  lore.html（元域演化史）
├── battle/     index.html（对战模拟器）  rules.html（对战规则说明）
├── admin/      index.html（精灵管理+天地图鉴+同步配置，3 个 Tab）
│               admin-skills / admin-traits / admin-items / admin-images
│               admin-lore / admin-individuals / admin-characters
│               admin-stages / admin-bloodline-skills   sidebar.js（后台侧栏唯一来源）
├── css/        style.css  navbar.css  admin.css  common-ui.css  dialog.css
│               diff-modal.css  responsive.css（必须最后引入）
├── js/         （见 §6 全清单）
├── functions/  img/[[path]].js（图片反代，缓存 7 天）  data/[[path]].js（数据反代，缓存 60s）
├── _tools/     测试与生成脚本（见 §11）
└── .github/workflows/deploy-cloudflare.yml（push → CF Pages）
```

> ⚠️ README §1 的目录树写的是 `admin/admin-reference/skills.html` 这类子目录结构，**已过时**。
> 2026-11-24 起后台页面**全部平铺在 `admin/` 下**，互链用同目录相对路径（如 `admin-skills.html`），
> 跳前台用 `../xxx.html`。README 其余内容（功能说明 §1.05、规范）仍准确。

---

## 3. 数据加载链路（理解本站的关键）

```text
前台页面：
  js/data-loader.js 的 VowmonData.ready(['vows', ...]).then(() => createApp(...).mount('#app'))
  源顺序：dataCdnBase（默认 https://vowmon.pages.dev/data，CF 反代 60s 缓存）
        → jsDelivr（约 12h 缓存）
        → raw.githubusercontent.com
  加载后把 JSON 字段赋给全局变量（allVowsData 等），才允许挂载 Vue。

后台页面（本机镜像优先）：
  ① localStorage['vowmon_mirror_<key>'] 有镜像 → 秒开（不发遮罩）
  ② 后台静默 reconcile：fetchRemote 带 ?_=时间戳 戳穿 60s 边缘缓存回源对账
     - 云端与镜像一致 → 无事
     - 不一致且本地无脏标记（vowmon_dirty_keys）→ 云端覆盖镜像，页面自动刷新
     - 不一致且本地有未同步修改 → 保留本地，等用户点「一键同步」
  ③ 保存：写 localStorage + markDirty；同步：推 JSON 到 GitHub（见 §7）
```

**铁律**：localStorage 草稿**永远优先于远端**（改回远端优先会丢用户未同步的修改）。
后台 `VowmonData.ready()` 不要传 `fresh: true`。

相关 localStorage 键（部分）：`vowmon_vows_data`、`vowmon_mirror_*`、`vowmon_dirty_keys`、
`vowmon_anim_on`（'false'=关动画）、`vowmon_sync_config`（Token/仓库名，仅本机）、
`vowmon_tags_library`、`vowmon_vows_visible_cols`（及 skills/traits/items 同名键）、`vowmon_lore_lastpush`。

---

## 4. 前台页面逐页手册

每页格式：**URL · 功能 · 数据 · 修改入口**。改版后记得升该页引用的 `?v=`。

| 页面 | URL | 功能要点 | 关键文件 |
|---|---|---|---|
| 首页 | `index.html` | Hero 横幅 + 三组入口卡（图鉴与资料 / 世界观 / 研究工具），卡片下挂小字快捷链接 | 静态 |
| 权柄看板 | `world/authority.html` | 力位权三律、权柄沙盘（等级→阶元→权限/代价）、权柄循环五步、三大机制、书内纪事 | `authority-config.js` |
| 阶元路径 | `world/ranks-path.html` | 等级轴联动精灵八阶/御兽师八阶/权限/联盟名号，两条铁律 | `authority-config.js` + `StageConfig` |
| 血脉共鸣模拟器 | `reference/bloodline-sim.html` | 选精灵+血脉之石→形态/技能/克制不变演示，族群技能包联动 | `bloodline-config.js` |
| 地区形态对照 | `dex/region-forms.html` | 按进化链/物种聚合，按地区筛选并排对照形态 | `region` / `form` 字段 |
| 故事时间线 | `records/timeline.html` | 按章节串联契约/进化/权柄事件，支持分类筛选 | 个体+人物 `milestones` |
| 精灵对比器 | `dex/compare.html` | 并排六维雷达图、总和、属性、身高体重对比 | 页内 SVG |
| 设定一致性检查 | `tools/consistency.html` | 只读扫描等级↔阶元、进化链 taxonomy、引用、图片、region 冲突、血脉技能 | `consistency-check.js` |
| 数据源诊断 | `tools/diagnostics.html` | CF/jsDelivr/raw 三线路测速 + 本机镜像/脏标记/动画/SW 状态 | 页内 Vue |
| 精灵图鉴 | `dex/vowdex.html` | 卡片墙，搜索+阶数/形态/属性多选筛选，分页 30；**异色悬停轮播**（有异色的卡悬停淡入异色图不放大，关动画只显示第一张） | 页内 Vue |
| 天地图鉴 | `dex/realm-dex.html` | 按 `realmTags`（权柄精灵/遥世精灵/伙伴精灵/晚熟精灵，文案来自 `realm-data.json`）分类的图鉴视图 | `realm-data.json` |
| 精灵列表 | `dex/list.html` | 表格视图，自定义显示列、列排序、多条件筛选；属性列用胶囊（图标+色来自 type-config） | 页内 Vue |
| 精灵详情 | `dex/vow-detail.html?id=` | 洛克王国 wiki 风：浮动展示台（纯 transform 动画）+ 种族值条 + 资料（含出现地区 region、taxonomy 分类）+ 特性卡 + 进化链 + 系别克制卡；顶部上/下一只芯片；**异色图在主图落地后空闲预载当前一只**（只预载 1 张，避免首屏抢带宽，点「异色」近乎秒切） | 页内 Vue |
| 技能图鉴 | `reference/skills.html` | 表格 + 四组筛选（类型/能耗/标签/系别，组内 OR 组间 AND），能耗与系别从数据自动派生，标签只显示实际用到的；技能名可点进详情 | `tag-config.js` |
| 技能详情 | `reference/skill-detail.html?id=` | 左列技能卡+学习方式统计，右列可学精灵网格（全部/自学/技能石 Tab，`learners[]` / `stoneLearners[]`） | `skills-data.json` |
| 特性大全 | `reference/traits.html` | 表格 + 按属性筛选，列出拥有者（`pokemons[]` / `hiddenPokemons[]`） | `trait-table` 子组件 |
| 性格大全 | `reference/natures.html` | 25 性格 5×5 速查矩阵 + 卡片（中/日/英文 + ±10% 修正）；数据只读 | `natures-data.json` |
| 物品图鉴 | `reference/items.html?id=` | 列表+详情同页；大类 Tab 自动显隐；图标有图用图，无图用 FA 图标+色 | `item-config.js` |
| 克制计算器 | `reference/calculator.html` | 防守面/进攻面 + 18×18 全表 | `type-chart.js` |
| 打击面计算器 | `reference/coverage.html` | 最多 5 属性组合覆盖 171 种属性组合的分档报告 | `type-chart.js` |
| 血脉图鉴 | `reference/bloodlines.html` | 世界观页：先天/后天血脉、四大血脉之石（lore CMS 管理） | `lore-data.json` |
| 等级体系 | `world/ranks.html` | 世界观页：力位权三律、八阶对照表、权柄循环（lore CMS，120 块） | 同上 |
| 御兽师图鉴 | `world/trainers.html` | 三维立身、御兽师等级表、契约反噬、修炼三法、御兽天赋（lore CMS，87 块） | 同上 |
| 势力版图 | `world/factions.html` | 联盟制度、九牧地区、权职体系、三大协会、荒野警示（lore CMS，43 块） | 同上 |
| 元域演化史 | `world/lore.html` | 全站唯一深色页（有意为之）：传世石板四章+终章；`【X】`自动渲染成属性/神秘胶囊；隐藏石板 blur 解锁（lore CMS，45 块） | `lore-apply.js` |
| 对战模拟器 | `battle/index.html` | 双精灵对战，引擎纯逻辑可测（`battle-engine.js`，745 行）：宝可梦官方伤害公式 + ±6 能力阶 + 6 种异常 + 天气/场地/先制/追加效果（**由技能效果文案关键词解析**，改文案即生效） | `battle-engine.js` |
| 对战规则 | `battle/rules.html` | 上述机制的图文说明 | 静态 |

**世界观五页是数据驱动的**：正文里带 `data-lore="页.c序"` 的元素被 `js/lore-apply.js` 用
`lore-data.json` 的 html 覆盖（失败兜底用 HTML 内置文本，永不白屏）。**改文案不需要改代码**——
去后台「页面内容」编辑；**改页面结构**才需要重跑 `_tools/lore_gen.py`（extend 合并模式，勿用 --fresh）。

**导航**：唯一来源 `js/navbar.js` 的 `NAV` 数组（ROOT 前缀按 pathname 自动判断子目录）；
后台侧栏唯一来源 `admin/sidebar.js`。当前导航里有两个 `soon: true` 占位：**精灵果实页**、**十八生态界页**。

---

## 5. 后台页面逐页手册

后台统一：不加载全站 navbar（自带 topbar + `admin/sidebar.js` 侧栏，侧栏按「图鉴数据 / 书内档案 / 内容与系统」三组）；弹窗用 `js/dialog.js`；
下拉用 `js/vow-select.js` 组件（**禁止原生 select**，会弹系统菜单）；长文本用 `js/vow-textarea.js`；
提示气泡用 `js/vow-tip.js`；同步/拉取全部带 **diff 预览弹窗**（见 §7）。

| 页面 | 功能 | 特别机制 |
|---|---|---|
| `admin/index.html` | 精灵管理（Tab: sprites）/ 天地图鉴（Tab: realm）/ 同步配置（Tab: settings） | 上传图片自动压缩转 PNG 并按编号命名（`image-utils.js`）；异色图 `shiny[]` 多张；特性槽位×3 与特性库双向同步；进化链 evoFrom/evoTo **双向自动补链**；编号默认最大+1 允许跳号；**出现地区 region 多选标签控件**（可新增、去重，旧字符串自动归一化成数组）；**taxonomy（域界门纲目科属种）保存时沿进化链 BFS 自动同步共用** |
| `admin-skills.html` | 技能管理 | 可学精灵选择器（搜索+属性筛选+千只不卡）；学习方式「自/石」一键切换；标签选择器（搜索/新建/删除，持久化 `vowmon_tags_library`） |
| `admin-traits.html` | 特性管理 | 拥有精灵芯片式（普通/隐藏★）；与精灵库双向互通（保存时反写 ability2/hiddenAbility） |
| `admin-items.html` | 物品管理 | 5 段数据（kinds/groups/categories/currencies/items）一起 diff/同步；图标上传 `items/{id}.png`；获取方式一行一条 |
| `admin-images.html` | 图片管理 | 「仓库图片」扫描 + 「精灵图片」核对双标签；缩略图走 raw.githubusercontent.com（**jsDelivr 忽略 ?v= 且缓存 12h，别改回去**）；分页 60/页；1000 条上限已用 Git Trees API 兜底 |
| `admin-lore.html` | 页面内容管理 | **双模式**：可视化（iframe 渲染前台页点 `[data-lore]` 就地编辑，点外部/点其他块=自动保存，Esc 才还原）+ 列表（textarea 逐块）；region 类字段为多选标签控件 |
| `admin-individuals.html` | 御兽精灵个体 | 自定义属性 fieldTemplates（默认模板/同步全部）；技能只存 name+level（**不存皆传模式**）；熟练度四档彩色（入门灰/熟练蓝/专精紫/完美金）；血脉=图鉴属性+血脉技能；阶段由等级经 `StageConfig.stageName()` 推导；昵称选填，空则回退种族名 |
| `admin-characters.html` | 御兽人物 | 势力/头衔/联盟币存款/物品栏/持有精灵（vowIds 引用个体）/简介等扩展字段 |
| `admin-stages.html` | 阶段境界 | 自定义八阶的个数/名字/区间/颜色（max=null 不封顶）；重叠/空洞校验；上下移；恢复默认 |
| `admin-audit.html` | 操作审计 | 保存/同步/拉取操作日志（含镜像快照），可导出 JSON / 恢复快照 / 清空 |
| `admin-bloodline-skills.html` | 血脉技能 | skills 数组 + families 族群技能包（map 段）一起 diff/同步 |

**Vue 生产版铁律（白屏事故教训）**：setup `return` 清单里漏任何一个模板引用 → 生产版
**静默中断渲染、无控制台报错**（表现为弹窗打不开/整页白屏）。新增页面/改模板后必须核对
return 清单；`v-for` 与 `v-if` 不能同元素（用 `<template>` 包裹）。可用 `_tools/test-admin-modal.html` 验证。

---

## 6. JS 模块全清单（js/ 目录，除 admin-*.js 见 §5）

| 文件 | 职责 |
|---|---|
| `data-loader.js` | **唯一取数入口**。FILES 键表、三源回退、镜像/reconcile、onChange、markDirty/markSynced/replace |
| `site-config.js` | `imgCdnBase` / `dataCdnBase` / 全局 `imgVer`（图片 URL 版本号，注意必须透传到 out 对象） |
| `navbar.js` | 全站导航唯一来源（NAV 数组 + ROOT 前缀 + 动效开关 + 搜索跳转 + isActive 补 .html——CF 会 308 去扩展名） |
| `admin/sidebar.js` | 后台侧栏唯一来源（12 项；`.html` 补齐；data-tab 仅 index 页拦截） |
| `type-config.js` | 18 属性图标/颜色唯一来源 |
| `css/type-filter.css` | 折叠式系别筛选（vowdex/list/skills/traits 四页共用，18 系别默认收起可搜索） |
| `type-chart.js` | 18×18 克制表 + `getTypeMultiplier` / `getComboMultiplier` |
| `category-config.js` | 技能分类（物理/特殊/变化）图标颜色 |
| `tag-config.js` | 技能标签内置库 23 个 + hash 兜底配色 |
| `item-config.js` | 物品大类/分组配置 |
| `stage-config.js` | `StageConfig.bands()/stageName(level)/stageColor(name)`；数据 `stages-data.json`，缺省回退内置八阶表 |
| `vowmon-utils.js` | 前台数据规整 normalizeAll（补齐缺字段防脏数据崩页） |
| `dialog.js` | `VowmonDialog`（confirm/alert/prompt/toast；禁系统弹窗；`vowmon:modal-close` 事件） |
| `diff-modal.js` | `VowmonDiff.review({mode:'push'|'pull', sections})` → Promise；每条差异可勾选（见 §7） |
| `github-api.js` | GitHubSync（uploadFile/downloadJson/listDirectory——1000 条静默截断已用 Trees API 兜底） |
| `image-utils.js` | 上传前压缩/等比缩放/统一 PNG |
| `common-ui.js` | 后台通用 UI + 应用 `.no-anim`（后台不加载 navbar） |
| `lore-apply.js` | 用 lore-data.json 覆盖 `[data-lore]` 元素，发 `vowmon:lore-applied` |
| `battle-engine.js` | 对战引擎纯逻辑（rng 注入可测），见 §4 battle 行 |
| `authority-config.js` | 权柄看板/阶元路径规则（三律、八阶权限、循环五步、三大机制）唯一来源 |
| `bloodline-config.js` | 血脉共鸣规则（四条后天血脉、血脉口诀）唯一来源 |
| `consistency-check.js` | 设定一致性检查纯逻辑（可在 Node 跑单测） |
| `global-search.js` | Ctrl/⌘+K 全站搜索面板（由 navbar.js 按需注入） |
| `audit-log.js` | 后台操作审计（保存/同步/拉取自动埋点于 VowmonStore，快照恢复） |
| `sw.js` + `manifest.webmanifest` | PWA 离线缓存（图片 cache-first / 数据 network-first / 静态 SWR；后台不注册） |
| `card-export.js` | 把精灵/个体/人物/物品渲染成 TCG 收藏卡 PNG（霞鹜文楷+思源宋体） |
| `vow-select.js` | 自绘下拉组件（捕获阶段 pointerdown 关菜单——修过"点外面不关"的 bug） |
| `vow-textarea.js` | 长文本编辑器组件（rows 固定高 + 放大弹窗） |
| `vow-tip.js` | 即时 tooltip（替代原生 title） |
| `admin.js` 等 admin-* | 见 §5 |

---

## 7. 同步 / 拉取与 diff 弹窗（2026-11-28 新增，重点）

**所有后台页的「一键同步」和「从仓库拉取」都先弹 `VowmonDiff.review` 差异预览**：

```text
流程（push 为例）：
  点「一键同步」→ 先 downloadJson 拉云端当前版本（404 = 首次同步，视为空）
  → VowmonDiff.review({ mode:'push', sections:[{label, local, remote, key, name, kind?}] })
  → 弹窗列出 新增/修改/删除 三类差异，字段级「旧→新」对比，可展开 +N 处改动
  → 每条可勾选（删除默认不勾防误删；全选才算完整同步清脏标记，部分同步保留未推送状态）
  → 确认后返回 { ok, count, all, sections:[{merged}] }，页面按 merged 上传
```

- sections 两种 kind：数组段（`key` 函数算主键）与 map 段（对象键，如 families、lore blocks）。
- lore 的 push **保留三方合并防回滚**：mirror / remoteNow / `vowmon_lore_lastpush` 快照对比——
  镜像没动而云端被外部改/删 → 采云端；镜像改过 → 采镜像；云端新增并入。合并结果 vs 云端再出 diff。
  （这条治好了「页面内容改了同步了又变回去」三轮排查出的终局根因：stale dirty mirror 整包同步回滚云端修复。）
- 数组值（如技能包的技能列表）在 diff 里显示为一行「内容：a、b → c」，不按索引拆 0/1。
- 已接入 9 个后台页全部同步/拉取入口。移动端 390/360px 已实测无溢出、触摸正常。

---

## 8. 部署与缓存

| 平台 | 地址 | 发布 |
|---|---|---|
| Cloudflare Pages（主站） | `https://vowmon.pages.dev/`（别名 `vowmon.keeptrue.ren`，新网 CNAME） | `.github/workflows/deploy-cloudflare.yml` + Secret `CLOUDFLARE_API_TOKEN`，push 即部署 |
| GitHub Pages（备用） | `luo029.github.io/vowmon/`（当前 301 到自定义域名） | Settings → Pages，`main` /(root)，push 即发布；**不要加 Pages 工作流**（PAT 缺 pages=write） |

缓存：`/img/*` 7 天（`functions/img`，换图加 `?v=imgVer` 或等 7 天）；`/css/*` `/js/*` 30 分钟；
`/data/*` 60 秒；HTML 协商缓存。**本地 css/js 引用统一带 `?v=YYYYMMDD`，每次改版手动升号**。

CF Pages 会把 `*.html` 308 到无扩展名路径——**所有 isActive 判断必须补 `.html`**（navbar.js 与 sidebar.js 都修过此 bug）。
图片上传时 `image-utils.js` 同时生成 `.webp` 副产物（压缩画布 `toDataURL('image/webp', 0.86)`），`/img/*` 反代优先返回同名 webp，不存在则回落原 PNG；换图靠 `imgVer` 破缓存。PWA SW 只在前台注册（后台不注册，避免缓存草稿）。

---

## 9. 工作流与验证工具（改完必跑）

```text
本地服务   python _tools/dev-server.py 8765（后台标签页定时器会被节流：sleep 轮询假挂死，
           点击后的检查要用微任务 Promise.resolve().then）
语法检查   node --check js/xxx.js
渲染断言   node _tools/assert-render.mjs http://127.0.0.1:8765 local   （29 项全站检查）
后台弹窗   node _tools/test-admin-modal.mjs http://127.0.0.1:8765 local （6 项）
侧栏       node _tools/test-sidebar.mjs （10 项）
diff 弹窗  node _tools/test-diff-logic.js（合并单测 15 项）
           node _tools/test-diff-modal.mjs（桌面 E2E 15 项）
           node _tools/test-diff-modal-mobile.mjs（390/360px 移动端 6 项）
对战引擎   node _tools/test-battle.mjs
异色预载   node _tools/test-shiny-preload.mjs（图片基址指本地 1×1 fixture，测"点击前已预载/秒切/只预载1张"）
lore 结构  python _tools/lore_gen.py（extend 合并模式重编号；--fresh 全量重编号慎用）
iframe 检查 _tools/test-admin-modal.html?page=xxx.html 结果写 document.title（PASS-click-open / FAIL-…）
           _tools/test-frontend-check.html?page=xxx.html（前台挂载检查，查 {{ }} 残留）
```

无头浏览器 E2E 的写法参考 `test-diff-modal.mjs`：CDP WebSocket + `Emulation.setDeviceMetricsOverride`；
注意 `Runtime.evaluate` 带 `awaitPromise: true` 时若表达式等待一个没人 resolve 的 Promise 会死锁，
开弹窗类调用要用 `awaitPromise: false`（evalNoWait）。移动物理仿真记得给演示页补 viewport meta。

---

## 10. 踩坑史速查（同类问题先查这里）

| 症状 | 根因 | 修复 |
|---|---|---|
| 后台 Vue 页整页白屏/弹窗不开，无报错 | setup return 漏项 / 解构漏项（生产版静默失败） | 核对 return 清单；用 test-admin-modal 验证 |
| 改版后本地白屏线上正常（或反之） | css/js 缓存错位 | 升 `?v=`，Ctrl+F5 |
| 后台缩略图死活不更新 | jsDelivr 忽略 ?v= 且 @main 缓存 12h | 后台缩略图走 raw.githubusercontent.com |
| 页面内容改了同步了又变回去（三轮） | ① reconcile 拿 60s 缓存旧值 ② 点外部静默还原 ③ stale dirty mirror 整包同步回滚云端 | ① fetch 带 `?_=时间戳` ② 点外部=自动保存 ③ 三方合并防回滚（§7） |
| 后台侧栏点精灵管理/天地图鉴不跳转 | data-tab 项无条件 preventDefault | 仅 index 页拦截 |
| 侧栏/导航高亮永远不亮 | CF 308 去掉 .html，isActive 匹配不上 | isActive 补 .html |
| `Cannot read properties of undefined (reading 'memo')` 白屏 | CDN 全量包用了 v-memo | 禁 v-memo，抽子组件 |
| 表格 hover 泛白 | tr 背景触发整行重绘 | hover 只改 td 背景；表头禁 transition: background |
| 全屏遮罩掉帧 | backdrop-filter 整屏模糊 | 遮罩默认无模糊，仅 body:not(.no-anim) 启用 |
| 图片管理破千丢图 | Contents API 1000 条静默截断 | listDirectory 自动切 Git Trees API |
| 下拉点外面不关 | 事件时序 | vow-select 捕获阶段 pointerdown |
| 自定义境界名后 RANK_SCOPE 失配 | 权柄阶元映射按名字写死（初灵↔初生…元灵↔掌元） | scopeNote 字段兜底；改名时提醒用户填 scopeNote |

---

## 11. 御兽世界设定观（世界观正典）

> 以下内容是**小说的世界观设定**，站点的数据结构、页面、文案全部围绕它构建。
> 正文原文存于 `lore-data.json`（382 块），本节是结构化摘要 + AI 理解用的解读。

### 11.1 世界基础：元域与三律

世界名为**【元域】**，由最初的神明**【元】**创造。元创造了精灵与世界后留下三颗初始种子——
【火】【草】【水】——说"去繁衍吧"就彻底失踪了（等级 100 的【元】是创世神位格，**不可达**，
精灵等级上限 99 级）。元留下三条世界法则，即**核心三律**：

- **【力】（战力）**：精灵自身的数值面板与技能，纯粹实力，修炼即得。
- **【位】（生态位）**：精灵在生态界占据的位置；通常先占位，才有对应的力。
- **【权】（权柄）**：生态界的**「唯一管理员账号」**——对应精灵全服只有一只，只能通过战斗争夺。
  掌权者可修改规则、给下位精灵增幅。**这是整个设定的灵魂机制。**

关键规则：**御兽师与精灵的契约只涉及【力】和【位】，不碰【权】**——所以平时可以一直待在
御兽空间里。状态组合：【力】【位】=常态契约；【力】【位】【权】=最强形态但御兽师承受不住
（见托举机制）；仅【力】=最稀少（升灵的面板却没有生态位）。

### 11.2 等级体系：八阶双轨（精灵 ↔ 御兽师一一对应）

**形态不变原则**：高阶精灵形态不变（蟋蟀永远是蟋蟀），变的是权限、法则与技能特效。
数据落点：`stages-data.json`（可后台自定义），默认八阶 `js/stage-config.js`。

| 精灵阶元 | 精灵等级 | 御兽师阶元 | 御兽师等级 | 核心表现 | 掌权权限 |
|---|---|---|---|---|---|
| 初灵 | 1–15 | 初生 | 1–15 | 基础觉醒，纯数值 | 无 |
| 升灵 | 16–35 | 精英 | 16–35 | 形态跃迁（完成进化） | 无 |
| 族尊 | 36–50 | 职业 | 36–50 | 种群之主，技能共鸣 | 同族借力 |
| 基座 | 51–60 | 枢座 | 51–60 | 生命支点，绝对特效 | 修改技能特效 |
| 灵相 | 61–70 | 承相 | 61–70 | 自然之踪（行为/现象概念） | 修改环境规则 |
| 律冠 | 71–89 | 司律 | 71–89 | 生态化身 | **反转全图克制** |
| 元灵 | 90–99 | 掌元 | 90–99 | 界主（生态界本身） | 重写底层法则 |
| 元 | 100 | 无对应 | — | 创世神，已失踪 | 不可达 |

**权柄循环五步**（精灵夺权又回到御兽师身边的唯一正途）：
解契（御兽师必须放生）→ 争夺权柄（打赢现任掌权者）→ 晋位进化 → 主动放权（把权柄扔给野生精灵）→ 重新契约。

**三大机制**：
- **托举机制**：掌权精灵抽取下位同属性精灵的力量维持统治——下位托举上位，掌权负担极重，
  御兽师会被瞬间抽干。族尊掌权 = 一整个种族的托举。
- **摇人机制**：平时不掌权，大战时御兽师通过感应把掌权的大佬精灵摇过来帮忙。
- **放权机制**：为了永远在一起，晋位完成后主动把权下放给野生精灵，负担消失即可重新契约。

**两条战斗铁律**：① 数值碾压——低级打高级，哪怕克制也打不过；同级别才看环境/特效/战术。
② 生物形态保留——律冠的火鸟还是鸟，只是羽毛能引发核爆。
（补充：若元灵沉睡不出手，大量低阶精灵的异常胜率会引发「生态界震动」，强制重写克制。）

### 11.3 御兽师体系：三维立身

契约的承载是御兽师的三维，**三项全部达标**才能契约精灵或让精灵进化：

- **肉身**：综合素质（攻击、速度等）。
- **精神**：灵魂强度；越强越适合构建**技能核心**；提升后可同步御兽加快技能领悟。
- **能量**：续航蓝条——维持御兽空间持续消耗，战斗加剧。耗尽则感知不到御兽空间、
  精灵 buff 全失效；脑海中下令耗能，所以**大部分御兽师会喊出技能来省能量**。
  战斗能更快提高能量上限——所以御兽师们经常对战。

**契约与反噬**：不达标强行契约/进化 → 轻则契约断裂神志不清，重则人宠俱亡。
**叠加规则**：每多契约一只，肉身/精神需求 +1（两只升灵 = 需要 20/20）。

御兽师等级表（数据在 `world/trainers.html` 的 lore 块）：

| 阶元 | 等级 | 契约需求(肉身/精神) | 能量上限 | 空间内消耗 |
|---|---|---|---|---|
| 初生 | 1–15 | 1/1 | 10 | 1 单位/时 |
| 精英 | 16–35 | 10/10 | 300 | 10 单位/时 |
| 职业 | 36–50 | 100/100 | 3,000 | 100 单位/时 |
| 枢座 | 51–60 | 200/200 | 5,000 | 200 单位/时 |
| 承相 | 61–70 | 500/500 | 20,000 | 500 单位/时 |
| 司律 | 71–89 | 1,000/1,000 | 50,000 | 1,000 单位/时 |
| 掌元 | 90–99 | 3,000/3,000 | 100,000 | 3,000 单位/时 |

（放出御兽空间、非战斗时消耗极少——初灵仅 1 单位/天。御兽师等级是**动态头衔**，后来者绝对比旧人强。）

**修炼三法**（均分品级，各对应一维）：肉身锤炼法 / 精神冥想法 / 能量吸收法。
**御兽天赋**：少数人特权，踏入职业级后才激活。
**精神强度测试道具【榨精杯】**：短时间榨干精神，每坚持 1 秒 = 1 单位精神强度。

### 11.4 血脉体系：石之共鸣

精灵天生两条血脉：**先天血脉**（锁死主属性，双属性则交织，一般不讨论）与**后天血脉**。
后天四类，各对应一颗**血脉之石**，御兽师持石与精灵共鸣唤醒（**原型参照仅助记，非世界设定**）：

| 血脉 | 别名 | 效果 | 原型参照 |
|---|---|---|---|
| 异变血脉 | — | 可控可逆的形态改变，战力大涨 | Mega 进化 |
| 黑暗血脉 | 隐/暗/月(夜)血脉 | 固定四技能且必带强大技能；神智与威力提高但**容易叛逆**；"邪恶精灵" | Z 招式 |
| 光明血脉 | 显/明/日(昼)血脉 | 固定四技能（随机他系）+ 必带强大技能；"正义精灵" | Z 招式 |
| 属性血脉 | — | +1 血脉技能（**族群技能**，由族尊向其他属性借技、随时可换）+1 属性技能【本心一击】（固定全精灵共有） | 太晶化+太晶爆发 |

**血脉口诀**：先天锁主系，后天四选一；石为钥，血为门，共鸣起，形态变。
**血脉不渡克制**：血脉给形态与技能，不给克制关系——火系精灵有水血脉，照样被水克。
数据落点：`bloodline-skills-data.json`（skills + families 族群技能包），后台 admin-bloodline-skills。
个体字段：`bloodline`（血脉类型）、`bloodlineSkill`、`bloodlineAttr`。

### 11.5 势力版图：联盟治世

- **地区划界**：世界按**地区**划分，每个地区有自己的**联盟**（政治军事分立）。已知主要地区：
  **九牧地区**（故事主舞台），由**九牧联盟**治理。
- **荒野（WILDS）**：地区之外的法外之地，邪恶势力藏身所；穿越荒野的商队须雇职业级以上护卫，
  且没人保证活着回来。
- **权职体系**（名号与实力并行）：**盟主**（政治最高）｜**戎枢**（军事最高）｜**大冠**（地区最强
  训练家，攀登终点）｜**太宰**（地区四大承相合称）｜**首座**（各属性最强枢座，一属性一座，
  十八系各争其位）｜**大君**（同时兼任政治+军事最高者）。
- **三大协会**：精灵协会 / 御兽师协会 / 学术协会。
- 数据落点：`characters-data.json` 的 factions/groups 自定义列表 + `characters[].faction`。

### 11.6 十八生态界演化史（world/lore.html，传世石板）

创世叙事：元创造世界 → 三颗种子（火草水）→ 万物演化：草茂生**虫**、腐朽生**毒**；火烧山野，
灰烬化**岩**与**地**，烟尘孕**飞行**；水极寒结**冰**、水面招**电**；岩石被地火熔炼成**钢**。
生灵之变：**超能力**（精神超脱）、**幽灵**（死后执念）、**一般**（无元素天赋）、**格斗**（极致搏杀）、
**恶**（生存诡计）。**龙蛇之变**：泥土中的【蛇】不甘匍匐——借水化蛟、入火生翼、交融剧毒死气、
百炼成钢，剥离一切借来的躯壳自诩为**龙**。**立于龙上之物**：来自星月的微光（**妖精**）能让龙的
法则在嬉笑间化为虚无——巨龙立于众生之上，它们立于巨龙之上。
**石板尾声伏笔**：界壁外有不属于自然演化的"异端"虎视眈眈；龙族真的毫无弱点吗？——等【元】归来的
那一天，别交出不及格的答卷。（隐藏石板章节在页面里默认模糊锁定，点击解锁。）

### 11.7 天地图鉴：精灵定位四类

`realm-data.json`（页面 `dex/realm-dex.html`，后台在 admin/index 的「天地图鉴」Tab）：

| 定位 | 含义 |
|---|---|
| 权柄精灵 | 能执掌世界规则的精灵，天地秩序基石，有名号与定位（对应【权】） |
| 遥世精灵 | 栖身偏远秘境与人类世界隔绝，绝大多数训练家终生无缘 |
| 伙伴精灵 | 亲和易建立羁绊，新人启程搭档（对应"御兽精灵"获取途径） |
| 晚熟精灵 | 前期平平，后期解锁潜藏力量 |

数据字段：`vow.realmTags`（数组，多选）。图鉴另有 `rank`（评级：初灵/升灵/族尊等设定内分级）。

### 11.8 书内档案（数据模型对应）

- **御兽精灵个体**（individuals-data.json）：`id / nickname(选填，空回退种族名) / speciesId(引图鉴) /
  gender / personality(习性，自由文本) / traits / skills[{name,level}] / bloodline / bloodlineSkill /
  bloodlineAttr / level(→StageConfig 推导境界) / ownerId(引人物) / items / experience / notes /
  contractDate / contractChapter / milestones + 自定义属性`。
- **御兽人物**（characters-data.json）：`id / name / title / faction / money(联盟币) / inventory /
  bio / position / background / personality / appearance / relations / strength / birthplace /
  vowIds(持有个体) / milestones + 自定义属性`。
- **术语注意**：`nature`=性格（图鉴 25 性格，影响种族值 ±10%）；`personality`=习性（自由描述）。
  这两个词 UI 上不得混用。
- **技能熟练度四档**：入门 / 熟练 / 专精（皆传时选迅疾或刚猛——**是出手时选的，档案不存**）/ 完美。

### 11.9 术语表（写文案/代码注释时对齐）

元域（世界）· 元（创世神）· 力/位/权（三律）· 权柄（生态界管理员账号）· 托举/摇人/放权（三大机制）·
血脉之石 · 共鸣 · 技能核心（精神构建）· 御兽空间 · 联盟币（货币）· 九牧地区/九牧联盟 · 荒野 ·
大冠/太宰/首座/大君/盟主/戎枢（权职）· 榨精杯（测试道具）· 生态界震动（元灵不出手时的强制改克制）

---

## 12. 奇思妙想与待办池（对话中用户提过/预留的）

- **地区形态精灵**：用户明确提过"后续可能还有地区形态的精灵"——`form` 字段已有
  主形态/地区形态/首领形态三值，region 字段（多选）已就位，做地区形态时可直接复用。
- **精灵果实页**：导航占位 `soon: true`；物品 `kind` 已有「精灵果实」大类。
- **十八生态界页**：导航占位 `soon: true`（元域演化史页里已有"界壁外的异端"伏笔可承接）。
- **对战模拟器**：已完成引擎+页面；机制全部由技能效果文案关键词解析——**加新机制优先改文案关键词**。
- **卡片导出**：`card-export.js` 可把数据渲染成 TCG 卡 PNG（霞鹜文楷正文+思源宋体卡名）。
- **taxonomy 进化链共用**：域界门纲目科属种——同一进化链上的精灵保存时 BFS 自动同步共用一套。
- **榨精杯 / 修炼三法 / 御兽天赋**：世界观已有设定，尚未做成图鉴条目（可进物品图鉴/新页）。

---

## 13. 参考资料与外部链接（搜集整理）

| 用途 | 地址 | 说明 |
|---|---|---|
| 宝可梦机制百科 | https://wiki.52poke.com/wiki/首页 | 对战引擎的官方依据：伤害公式、能力变化 ±6、异常状态、天气场地、优先度、击中要害 1/24。**本站机制的权威参考** |
| 洛克王国 4399 | https://news.4399.com/luoke/ | `vow-detail.html` / `skill-detail.html` 的 wiki 布局参照来源（展示台+种族值+进化链+克制卡的版式观感） |
| Vue 3 文档 | https://vuejs.org/guide/ | CDN 全量包 `vue@3/dist/vue.global.prod.js`（jsDelivr，prod 版）；**内联模板运行时编译，遵守 §5 白屏铁律** |
| Font Awesome 6.4 | https://fontawesome.com/v6/search | 全站图标唯一来源（`fa-solid fa-*`） |
| Inter 字体 | jsDelivr CDN | 变量字体；中文交给系统字体栈（HarmonyOS/MiSans/思源黑体/苹方/雅黑），**禁 Google Fonts Nunito（被墙）** |
| Cloudflare Pages 文档 | https://developers.cloudflare.com/pages/ | Functions（`functions/`）、`_routes.json`、`_headers`、Custom domain 登记 |
| GitHub REST API | https://docs.github.com/rest | Contents API（1000 条上限）、Git Trees API（兜底）、Fine-grained Token（只存 localStorage） |
| jsDelivr | https://www.jsdelivr.com/ | 数据兜底源；注意 @main 12h 缓存且忽略 query —— 只用作前台兜底，后台缩略图禁用 |
| 霞鹜文楷 / 思源宋体 | 各 CDN | 仅 `card-export.js` 卡片导出用 |

**数据源候选**（site-config 可切换）：CF 反代 `https://vowmon.pages.dev/data`（默认）→
`https://cdn.jsdelivr.net/gh/luo029/vowmon_data@main` → `https://raw.githubusercontent.com/luo029/vowmon_data/main`。

---

## 14. 给新 AI 的第一分钟清单

1. 读 §0–§3（是什么、仓库分工、数据链路）。
2. 用户在谈某个页面 → 查 §4/§5 表格定位文件，再读对应 HTML/JS。
3. 用户在谈数据不对 → 先分清是**站点代码**还是 **vowmon_data 数据**的问题；数据修复走
   `git commit` 到 vowmon_data 仓库并推送（数据仓库与站点仓库是两个 git）。
4. 用户在谈世界观/写小说 → 查 §11；改世界观正文走后台 admin-lore 或直接编辑 lore-data.json
   （注意三方合并快照 `vowmon_lore_lastpush` 只在用户浏览器里，改仓库不会冲突）。
5. 改完 → 本地 `dev-server.py` + 相关 test 脚本验证 → 升 `?v=` → commit+push → 报告用户。
6. 拿不准时看 `git log --oneline` 最近的提交信息——本仓库提交信息写得非常详细，是活的历史。
