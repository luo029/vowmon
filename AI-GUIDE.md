# Vowmon Wiki · AI 总纲

> **本文档是给 AI 看的**。目标：任何 AI（换了模型、换了人、新开对话）读完这一份文件，
> 就能立刻接手这个项目的**代码、数据、世界观设定、工作习惯与用户要求**，不需要重新摸索。
>
> 配套文件：`README.md`（面向使用者的详细功能手册与开发规范，本文有大量引用）。
> 两者冲突时，以**仓库实际代码**为准，其次本文，再次 README。
> 交接版本：2026-11-28 深夜（含每日精灵灵感四源模块、外部参考数据库、已参照名录弹窗）；
> **同日晚已做一轮文档↔代码对齐**（目录树、境界区间、图片缓存天数、后台 fresh 策略、导航 soon 数量、后台页清单），
> 之后若再发现文档与代码不一致，按 §0.5.1 第 33 条处理：改文档 + 记日志。

---

## 0. 快速开始（30 秒版本）

```text
项目     = 一个"御兽精灵"题材的小说设定 Wiki + 数据管理后台（纯静态，无后端服务器）
代码仓库 = D:/novels/vowmon        → github.com/luo029/vowmon      （站点本体，不含数据）
数据仓库 = D:/novels/vowmon_data   → github.com/luo029/vowmon_data （唯一数据源，17 个 JSON）
图片仓库 =                            github.com/luo029/vowmon_imgs （按编号命名的 PNG）
线上主站 = https://keeptrue.ren/vowmon/（CF Pages 自定义域名，注意是子路径！根路径是旧站"养真斋"）
备用地址 = https://vowmon.pages.dev/（CF Pages 默认域） / https://luo029.github.io/vowmon/（301 到主站）
技术栈   = 原生 HTML + Vue3 CDN 生产版（运行时编译内联模板）+ Font Awesome 6.4，零构建零打包
数据流   = 后台页面改 localStorage 镜像 → 一键同步推 JSON 到 vowmon_data → 前台 /data/* 反代（60s 缓存）读取
外部参考 = PokeAPI/洛克/奥奇/赛尔四站数据由 _tools 生成器一次性抓取成静态 JSON（不接 AI、不实时调外部站）
```

**AI 接手任何任务前必读的硬规范**（详见 §0.5 用户要求全记录 + §11 踩坑史）：

1. 「精灵」英文统一 **Vowmon**，图鉴英文 **Vowdex**。禁止 Pokemon / Pokedex / pet(s) 作为对外名称。
2. 给用户的代码输出必须用 ` ```text ` 代码块、无高亮、无省略号，文件名写在代码块上方。
3. **改完立即提交推送**，用户偏好"推送完毕就结束任务"。
4. 组件本身有问题要修组件文件，不要在页面里打补丁。
5. 用户质疑"不生效"时必须实测查到根因，不许口头解释了事（用户会明确授权实测）。
6. 每次 css/js 改动必须升 `?v=YYYYMMDD[字母]` 版本号，否则缓存错位白屏。
7. **能构造 URL 绝不请求接口，能引用的绝不下载**——外部数据采集的第一哲学（§10）。
8. 数据文件体积敏感：GitHub 仓库会被用户检查，新增数据先想瘦身（§10.0）。
9. 文档（README / AI-GUIDE）与代码不一致时，**改文档对齐代码并记日志**，别让下一任 AI 按错的口径干活。

---

## 0.5 用户对 AI 的要求全记录（交接必读）

> 这是用户在全部协作过程中**明确说过的要求**与 AI **总结出的隐性要求**。
> 新 AI 必须把这一节当作"用户手册"来执行——这些不是建议，是命令。

### 0.5.1 显式要求（用户原话级指令，按主题归档）

**命名与代码输出**

1. 「精灵」的英文名统一为 **Vowmon**；图鉴英文为 **Vowdex**；禁止使用 Pokedex / Pokemon / pet(s) 作为对外名称（标识符、CSS 类、文件名、存储键、数据字段全量执行过改名）。
2. 代码输出用 ` ```text ` 代码块、**无高亮、无省略号**，文件名写在代码块上方。
3. 回复用简体中文。

**目录与架构**

4. 后台 HTML 统一放 `admin/` 子目录，前台 HTML 留根目录；按文件类型分 `css/`、`js/`；禁止新增 assets/pages/data 之类的目录；站点仓库**不存数据**。
5. 三仓硬分工：站点仓不放数据、数据仓只放 JSON、图片仓只放按编号命名的图片。
6. 站点本体（vowmon 仓）**不存任何数据**，`data/` 目录已删除，别再建回来。

**工作流**

7. 改完代码**立即提交推送**，推送完毕就结束任务（不要拖着问"还要做什么吗"）。
8. 每次 css/js 改动手动升级 `?v=YYYYMMDD[字母]` 版本号（防缓存错位白屏）。
9. 组件问题修组件文件本身，不在页面里打补丁。
10. 用户质疑"不生效"时，必须实测查到根因，不许口头解释了事。
11. 修改后要验证：语法 + 模板绑定审计 + 无头浏览器冒烟测试（用户有时会说"不需要测试尽快完成"——那是授权跳过测试直接交付，但数据类改动仍至少验数据）。

**每日精灵灵感页（tools/daily-pokemon.html，2026-11-28 全天迭代）**

12. 每日随机精灵卡片：**不用 AI**，静态数据 + 规则模板生成灵感提示。
13. 多数据源开关：宝可梦 / 洛克王国 / 奥奇传说 / 赛尔号四源合一卡，卡片**标注出处**（「出自 ·」徽标）。
14. 排除已参照开关：读取图鉴 vow 的【原型】字段，已写过的精灵不进随机池。
15. 盲盒模式：隐藏参考只看提示。
16. 进化链要显示、**成员可点击跳转**到对应精灵卡。
17. 种族值该有几维就几维：洛克是六维（含魔攻/魔防），赛尔是六维（含特攻/特防），少一维都是 bug（用户拿截图纠错过两次）。
18. 「要学会变通」：外部站的数据不一定在预想的字段/版式里，奥奇详情页三种版式自适应解析；别轻易下"数据是 JS 动态抓不到"的结论——**先实测再下结论**。
19. 特殊内容自适配：四源各自独有的东西都要展示（宝可梦特性/奥奇技能+成长故事/赛尔魂印+刻印），用户原话"这四个网站都检查一下，要自适应，自适配！"
20. 特性卡片、技能卡片也要做（同样四源取材），要**详细**：名称、描述、参数、**哪些精灵能学会/拥有**，都属于每日灵感栏目。
21. 表格解析防"串台"：只取紧跟表头的连续数据行（奥奇技能表尾部混过推广行）。
22. 分类标签按 52poke 定义：**大器晚成 = 准神 600 族 10 条进化线**（不是 slow 成长！传说宝可梦同样是 slow，曾因此误标奈克洛兹玛）；最初的伙伴 = 历代御三家基础形态；传说/幻之按 PokeAPI is_legendary/is_mythical。
23. 已参照名录：按钮 + 弹窗，先列全部被参照精灵，点击后展示**誓约精灵 ↔ 参照原型双卡对比**（含图像）。
24. 「出自」标注不能空白——初始化配置对象时要整体带过来（曾因只带 count 漏 label 导致徽标空白）。
25. UI 细节用户会盯：徽标被裁切、字号太小、名字看不清都会被截图指出，**修就要修到完整可见**。

**数据采集与体积（用户最强烈的偏好之一）**

26. **"能构造 URL 的绝不请求接口，能引用的绝不下载"**——赛尔号图片用 `Special:FilePath` 构造 302 直链、洛克图片直接引用源站 URL，零图片请求零落盘。
27. `_tools` 体积要小："不应该每只精灵一个 html？不应该变成一个数据文件类似 json 这样么……精灵图片不要下载放在本地，直接引用网站上的图片就可以！你这样文件太大了！"→ 缓存目录全部进 `.gitignore`，用完即删，线上仓库只有 JSON。
28. 数据 JSON 不希望太大：inspiration-skills.json 曾 7.6MB，已瘦身到 4.8MB（learners 截 80、去冗余字段、截断超长文本）。**新增数据文件前先想体积**。
29. 会问"数据会上传 GitHub 吗？我不希望文件太大"——要如实报告文件体积。

**验收习惯**

30. 用户用**截图**纠错（迪莫六维、奥奇加载不出、奈克洛兹玛标签），看到截图先复现再改。
31. 用户给链接就是让你去读（52poke 分类页、biligame wiki），读的时候把定义/判定标准弄准确，别想当然。
32. "再查查还有没有别的错误"→ 主动做全面数据体检（进化链、属性取值、stats 完整性），把真错误和"源站本来就没有"区分开汇报。
33. **要你先"读整个代码库（尤其 README 和 AI-GUIDE）"再干活**：读完必须核对文档与代码是否一致，
    有偏差就**改文档**（README + AI-GUIDE 一起改），**每次修改都要记日志**（`.doubao/memory/agents/<agent>/YYYY-MM-DD.md`，
    全局流水另记 `CHANGELOG.md`）。
    用户原话（2026-11-28）："读取整个代码库，特别是 readme 和 ai readme" → "有偏差的，修改一下" → "记得每次修改都要有日志"。
34. **多个 agent 协作时各写各的日志**（用户 2026-11-29 拍板）：一个 agent 一个目录 `agents/<agent>/`，目录名用角色
    （`doubao-main` / `sub-<任务>`）不用会话 ID；跨 agent 改动汇总在 `.doubao/memory/CHANGELOG.md`，一行一条
    （日期 / Agent / 范围 / 改了什么 / 短 commit），"这行代码是谁改的"只查这张表。规则全文见 `.doubao/memory/README.md`。

### 0.5.2 隐性要求（AI 总结的用户偏好与行事风格）

1. **数据准确性 > 一切**。用户对精灵数据非常熟，任何维度缺失/串台/乱码都会被发现；交付前自检字段的完整性与正确性。
2. **能批量不逐页**：SMW ask 分页批量、页面内嵌 JSON 一次拿全、构造直链——所有采集先找"批量通道"。
3. **先查数据层再查展示层**：显示错了先看 JSON 里对不对（赛尔六维 bug 就是一个键名错位）。
4. **根因修复**：不打补丁绕过（ex-src 徽标被裁切就改定位，不是加 padding 遮掩）。
5. **诚实的降级**：源站没有的数据（洛克无静态技能文本、赛尔技能无归属精灵）如实标注"源站未公布/暂无名单"，不编造。
6. **任务闭环**：改完 → 验证 → commit（两仓分别）→ push → 汇报 → 追加工作日志。
7. **提交信息写详细**：本仓库的 git log 是活的历史，新 AI 排查问题时先看 log。
8. **遇到 WAF/限速**：限速 + 缓存续抓 + 降级不阻断（部分数据拿不到先落盘其余，下次续抓）。
9. **中文回复**、直接、不绕弯；用户风格是"给方向 + 主动纠错"，期待 AI 有自己的想法并变通执行。
10. **每完成一件事记日志**到 `.doubao/memory/agents/<agent>/YYYY-MM-DD.md`（长期约定沉淀到同目录 `MEMORY.md`，跨 agent 流水进 `CHANGELOG.md`）。

---

## 1. 三个仓库的分工（硬约定）

| 仓库 | 本地路径 | 内容 | 谁读 |
|---|---|---|---|
| `vowmon` | D:/novels/vowmon | HTML/CSS/JS + `functions/` + `_tools/` 生成器，**禁止放数据**（`data/` 目录已删除） | CF Pages / GH Pages |
| `vowmon_data` | D:/novels/vowmon_data | 仓库根目录 17 个 JSON（唯一数据源） | 前台运行时拉取、后台读写 |
| `vowmon_imgs` | — | `sprites/{编号}.png`、`sprites/{编号}_s.png`（异色）、`items/{id}.png` | 前台经 `/img/*` 反代 |

数据仓库文件清单（**新增文件必须同步进本清单**，前 11 个走 `data-loader.js`，后 6 个是外部参考数据仅供 `tools/daily-pokemon.html` 直接 fetch、**不走 data-loader**）：

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
| `lore-data.json` | `{pages[],blocks{}}` | `allLoreBlocks` | 世界观五页正文文本块（键 `页.c序`，362 块） |
| `realm-data.json` | `{labels{},descs{}}` | — | 天地图鉴四类精灵定位的名称与描述 |
| `pokemon-data.json` | `{pokemon[],count}` | — | 宝可梦参考（1025 只，PokeAPI；特性/进化链/**tags 分类标签**） |
| `rock-data.json` | `{pets[],count}` | — | 洛克王国世界（644 只，rocokingdomworld.org；六维种族值 hp/atk/mag/def/res/spe） |
| `aoqi-data.json` | `{pets[],count}` | — | 奥奇传说（1606 只，100bt；普通技/超杀技+特效/特长/成长故事） |
| `seer-data.json` | `{pets[],count}` | — | 赛尔号（4978 只，biligame BWIKI SMW；六维 sa/sd/**专属魂印 2171 条/专属刻印 2539 条**/进化链 2262 条） |
| `inspiration-abilities.json` | `{items[],count,kind:'ability'}` | — | 每日特性库 2460 条（pk284/rk224/se魂印1943/aq9），每条含 desc + learners |
| `inspiration-skills.json` | `{items[],count,kind:'skill'}` | — | 每日技能库 10263 条（pk920/rk586/se6000/aq2757），每条含参数 + learners |

体积参考（用户对体积敏感）：`inspiration-skills.json` 4.8MB、`seer-data.json` 4.2MB、`aoqi-data.json` 1.1MB、`inspiration-abilities.json` 1.15MB、其余都在 0.6MB 以内。**新增数据先瘦身再提交**（§10.0）。

当前站点自有数据规模：16 精灵 / 2 技能 / 1 特性 / 25 性格 / 8 境界 / 1 个体 / 1 人物 / 18 血脉技能 / 362 文本块。**站点按千只规模设计压测过**，别担心容量，只 worry 缓存和分页（README §3）。

---

## 2. 目录结构与文件清单（以实际仓库为准）

```text
vowmon/
├── index.html / 404.html
├── dex/        vowdex.html（精灵图鉴）  list.html（列表）  vow-detail.html（精灵详情）
│               realm-dex.html（天地图鉴：权柄/遥世/伙伴/晚熟四类定位）
│               compare.html（对比器）  region-forms.html（地区形态对照）
├── records/    individuals.html（御兽精灵个体）  characters.html（御兽人物）  timeline.html（故事时间线）
├── reference/  skills.html  skill-detail.html  traits.html  natures.html
│               items.html  calculator.html（克制计算器）  coverage.html（打击面）
│               bloodlines.html（血脉图鉴）  bloodline-sim.html（血脉共鸣模拟器）
├── world/      authority.html（权柄看板）  ranks-path.html（阶元路径）  ranks.html（等级体系）
│               trainers.html（御兽师图鉴）  factions.html（势力版图）  lore.html（元域演化史）
├── battle/     index.html（对战模拟器）  rules.html（对战规则说明）
├── tools/      daily-pokemon.html（每日精灵灵感）  consistency.html（设定一致性检查）
│               diagnostics.html（数据源诊断）
├── admin/      index.html（精灵管理+天地图鉴+同步配置，3 个 Tab）
│               admin-skills / admin-traits / admin-items / admin-images
│               admin-lore / admin-individuals / admin-characters
│               admin-stages / admin-bloodline-skills / admin-audit   sidebar.js（后台侧栏唯一来源）
├── css/        style.css  navbar.css  admin.css  common-ui.css  dialog.css
│               diff-modal.css  type-filter.css（折叠系别筛选）  global-search.css（Ctrl+K）
│               responsive.css（必须最后引入）
├── js/         （见 §6 全清单）
├── functions/  img/[[path]].js（图片反代，优先 WebP，缓存 7 天）  data/[[path]].js（数据反代，缓存 60s）
├── _tools/     测试脚本 + 外部数据生成器（见 §9/§10）
└── .github/workflows/deploy-cloudflare.yml（push → CF Pages）
```

> ✅ README §1 的目录树已于 2026-11-28 同步为**平铺结构**（与本文一致）。2026-11-24 起后台页面
> **全部平铺在 `admin/` 下**，互链用同目录相对路径（如 `admin-skills.html`），跳前台用 `../xxx.html`；
> 前台页面按模块进 `dex/` `records/` `reference/` `world/` `battle/` `tools/`，根目录只留 `index.html` 与 `404.html`。
> 两文若再出现不一致，以代码为准，**并且要顺手把文档改掉 + 记日志**（用户 2026-11-28 的明确要求）。

---

## 3. 数据加载链路（理解本站的关键）

```text
前台页面：
  js/data-loader.js 的 VowmonData.ready(['vows', ...]).then(() => createApp(...).mount('#app'))
  源顺序：dataCdnBase（默认 https://vowmon.pages.dev/data，CF 反代 60s 缓存）
        → jsDelivr（约 12h 缓存）
        → raw.githubusercontent.com
  加载后把 JSON 字段赋给全局变量（allVowsData 等），才允许挂载 Vue。

每日精灵灵感页（tools/daily-pokemon.html）不走 data-loader：
  页内 fetchSource() 按同样的三源顺序直接 fetch 6 个参考 JSON（带 ?_=时间戳戳穿缓存）。
  VowmonData 只用 softReady(['vows']) 静默拿图鉴 vow 扫【原型】字段。

后台页面（分两种，取决于页面有没有传 fresh）：
  A. 强制回源（传了 {fresh:true}）：admin.js 精灵(vows+traits) / admin-skills(skills+vows)
     / admin-items / admin-images(vows) / admin-individuals(8 个 key) / admin-characters / admin-stages
     → 打开就等网络、显示「正在加载数据…」遮罩，好处是打开即最新
  B. 镜像优先（没传 fresh）：admin-traits(vows+traits) / admin-bloodline-skills(bloodlineSkills+individuals+vows)
     → 有镜像就秒开（不发遮罩）+ 后台静默对账
  ① localStorage['vowmon_mirror_<key>'] 有镜像 → 先用它渲染（A 类页面跳过这步，直接回源）
  ② 后台静默 reconcile：fetchRemote 带 ?_=时间戳 戳穿 60s 边缘缓存回源对账
     - 云端与镜像一致 → 无事
     - 不一致且本地无脏标记（vowmon_dirty_keys）→ 云端覆盖镜像，页面自动刷新
     - 不一致且本地有未同步修改 → 保留本地，等用户点「一键同步」
  ③ 保存：写 localStorage + markDirty；同步：推 JSON 到 GitHub（见 §7）
  ④ 注意：后台保存会直接向 vowmon_data 推提交（提交信息 "Admin Panel: Update xxx"），
     生成器重跑/改数据仓前先 git pull --rebase，否则 push 被拒。
```

**铁律**：localStorage 草稿**永远优先于远端**（改回远端优先会丢用户未同步的修改）。
`fresh` 两种都合法：要秒开就别传（需要最新数据点顶栏「从仓库拉取」），要打开即最新就传。
**现状是 7 个后台页传、2 个不传**——改页面时按上面的清单同步更新，别写「一律不要传 fresh」这种与代码相反的话（README 曾在这一点上写反，2026-11-28 已修正）。

相关 localStorage 键（部分）：`vowmon_vows_data`、`vowmon_mirror_*`、`vowmon_dirty_keys`、
`vowmon_anim_on`（'false'=关动画）、`vowmon_sync_config`（Token/仓库名，仅本机）、
`vowmon_tags_library`、`vowmon_vows_visible_cols`（及 skills/traits/items 同名键）、`vowmon_lore_lastpush`、
每日精灵灵感页专属：`vowmon_daily_src`（四源开关）/ `vowmon_daily_show`（盲盒）/ `vowmon_daily_skip_ref`（排除已参照）。

---

## 4. 前台页面逐页手册

每页格式：**URL · 功能 · 数据 · 修改入口**。改版后记得升该页引用的 `?v=`。

| 页面 | URL | 功能要点 | 关键文件 |
|---|---|---|---|
| 首页 | `index.html` | Hero 横幅 + 三组入口卡（图鉴与资料 / 世界观 / 研究工具），卡片下挂小字快捷链接 | 静态 |
| **每日精灵灵感** | `tools/daily-pokemon.html` | **三卡合一页**：每日精灵卡（四源 1025+644+1606+4978 只）+ 每日特性卡（2460 条）+ 每日技能卡（10263 条），各自独立日期种子 + 随机按钮；顶部四源数据源开关决定随机池；卡片**标注出处**；精灵卡含中文名/属性/地区/**分类标签（传说/幻之/最初的伙伴/大器晚成）**/六维种族值/进化链可视化（可点击跳转）/特性chips/奥奇技能/赛尔魂印刻印；特性/技能卡含详细描述+参数+**可学精灵名单**（点击 `jumpLearner()` 跳精灵卡）；「已参照名录」弹窗（誓约↔原型双卡对比）；盲盒/排除已参照双开关；灵感提示按源自适应（含特性改编/专属印记模板）。**详见 §10** | 页内 Vue + 6 个参考 JSON |
| 权柄看板 | `world/authority.html` | 力位权三律、权柄沙盘（**选书内御兽精灵个体**，图鉴仅取种族图/名）、权柄循环五步、三大机制、书内纪事 | `authority-config.js` |
| 阶元路径 | `world/ranks-path.html` | 等级轴联动精灵八阶/御兽师八阶/权限/联盟名号，两条铁律 | `authority-config.js` + `StageConfig` |
| 血脉共鸣模拟器 | `reference/bloodline-sim.html` | **选书内个体**（默认读档案已记录的血脉）+ 血脉之石→形态/技能/克制不变演示 | `bloodline-config.js` |
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
后台侧栏唯一来源 `admin/sidebar.js`。当前导航里共有 **3 个 `soon: true` 占位**：**精灵果实页**（挂在物品图鉴下）、**十八生态界页**（挂在元域演化史下）、**地图**（一级菜单 `key: 'map'`）。

---

## 5. 后台页面逐页手册

后台统一：不加载全站 navbar（自带 topbar + `admin/sidebar.js` 侧栏，侧栏按「图鉴数据 / 书内档案 / 内容与系统」三组）；弹窗用 `js/dialog.js`；
下拉：选项多 / 需要搜索的选择器用 `js/vow-select.js` 组件；只有固定几个选项的筛选、排序可以用原生 `<select>`，
但**必须套页面级样式**（`.filter-select` / `.sort-select` 或 `.field select`，`appearance:none` + 自绘箭头），
不能出现没有任何样式、直接弹系统默认菜单的裸 `<select>`；长文本用 `js/vow-textarea.js`；
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
| `admin/sidebar.js` | 后台侧栏唯一来源（13 个页面入口 / 15 行含 3 个分组标题；`.html` 补齐；data-tab 仅 index 页拦截；**每个后台页都要挂 `.side-nav` + 引这个脚本**） |
| `type-config.js` | 18 属性图标/颜色唯一来源 |
| `css/type-filter.css` + `css/global-search.css` | 折叠式系别筛选（vowdex/list/skills/traits 四页共用，18 系别默认收起可搜索）+ Ctrl/⌘+K 搜索面板样式 |
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

## 7. 同步 / 拉取与 diff 弹窗（重点）

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
| Cloudflare Pages（主站） | **`https://keeptrue.ren/vowmon/`（用户日常入口，子路径！）** 与 `https://vowmon.pages.dev/`（别名 `vowmon.keeptrue.ren`） | `.github/workflows/deploy-cloudflare.yml` + Secret `CLOUDFLARE_API_TOKEN`，push 即部署，实测约 2~5 分钟上线 |
| GitHub Pages（备用） | `luo029.github.io/vowmon/`（301 到 keeptrue.ren/vowmon/） | Settings → Pages，`main` /(root)，push 即发布；**不要加 Pages 工作流**（PAT 缺 pages=write） |

> ⚠️ **`keeptrue.ren` 的根路径是另一个旧站「养真斋」（7 月的静态页），与本项目无关！**
> 排查"线上是旧版"时先对比 `keeptrue.ren/vowmon/` 与本地，**别看根路径**；
> 用户截图里的旧导航多半是浏览器缓存，让用户 Ctrl+F5。

缓存：`/img/*` 7 天（`functions/img`，换图加 `?v=imgVer` 或等 7 天）；`/css/*` `/js/*` 30 分钟；
`/data/*` 60 秒；HTML 协商缓存。**本地 css/js 引用统一带 `?v=YYYYMMDD`，每次改版手动升号**。

CF Pages 会把 `*.html` 308 到无扩展名路径——**所有 isActive 判断必须补 `.html`**（navbar.js 与 sidebar.js 都修过此 bug）。
图片上传时 `image-utils.js` 同时生成 `.webp` 副产物（压缩画布 `toDataURL('image/webp', 0.86)`），`/img/*` 反代优先返回同名 webp，不存在则回落原 PNG；换图靠 `imgVer` 破缓存。PWA SW 只在前台注册（后台不注册，避免缓存草稿）。

**数据仓库远端有后台面板的自动提交**（"Admin Panel: Update xxx"）——对 vowmon_data 做任何本地操作前先 `git pull --rebase`，否则 push 被拒（非 fast-forward）。

---

## 9. 工作流与验证工具（改完必跑）

```text
本地服务   python _tools/dev-server.py 8765（后台标签页定时器会被节流：sleep 轮询假挂死，
           点击后的检查要用微任务 Promise.resolve().then）
语法检查   node --check js/xxx.js
绑定审计   抽 HTML 内 <script> 用 new Function 验语法 + 三向核对（模板绑定 vs return 清单 vs 定义），
           $event 是 Vue 内置、v-for 局部变量是合法缺失——脚本模板见 .doubao/memory/agents/doubao-main/2026-11-28.md
渲染断言   node _tools/assert-render.mjs http://127.0.0.1:8765 local   （41 项断言，42 页里除 404 全在内）
后台弹窗   node _tools/test-admin-modal.mjs http://127.0.0.1:8765 local （6 项）
侧栏       node _tools/test-sidebar.mjs （11 项，含操作审计页）
diff 弹窗  node _tools/test-diff-logic.js（合并单测 15 项）
           node _tools/test-diff-modal.mjs（桌面 E2E 15 项）
           node _tools/test-diff-modal-mobile.mjs（390/360px 移动端 6 项）
对战引擎   node _tools/test-battle.mjs
异色预载   node _tools/test-shiny-preload.mjs（图片基址指本地 1×1 fixture，测"点击前已预载/秒切/只预载1张"）
手机审计   node _tools/audit-mobile.mjs（42 页 × 390/360px，检查横溢/未编译模板，结果写 _tools/mobile-audit.json）
           新增页面要手动补进 audit-mobile.mjs 的 PAGES（清单是手写的，不会自动发现）
功能 E2E   node _tools/test-site-e2e.mjs（21 项：筛选/排序/异色/Ctrl+K/个体源/血脉默认/审计等）
lore 结构  python _tools/lore_gen.py（extend 合并模式重编号；--fresh 全量重编号慎用）
数据生成   node _tools/gen-pokemon-data.mjs / gen-rock-data.mjs / gen-aoqi-data.mjs
           / gen-seer-data.mjs / gen-inspire-extra.mjs（见 §10）
iframe 检查 _tools/test-admin-modal.html?page=xxx.html 结果写 document.title（PASS-click-open / FAIL-…）
           _tools/test-frontend-check.html?page=xxx.html（前台挂载检查，查 {{ }} 残留）
冒烟测试   无头 Chrome：chrome.exe --headless=new --no-sandbox --disable-gpu
           --virtual-time-budget=30000 --dump-dom --user-data-dir=<系统临时目录新 profile> <URL>
           （user-data-dir 必须用绝对路径；检查 {{ mon./ability./skill. 未编译残留、关键文案、ex-card 数量）
```

无头浏览器 E2E 的写法参考 `test-diff-modal.mjs`：CDP WebSocket + `Emulation.setDeviceMetricsOverride`；
注意 `Runtime.evaluate` 带 `awaitPromise: true` 时若表达式等待一个没人 resolve 的 Promise 会死锁，
开弹窗类调用要用 `awaitPromise: false`（evalNoWait）。移动物理仿真记得给演示页补 viewport meta。

---

## 10. 外部参考数据与生成器手册（每日精灵灵感页的数据底座）

> **采集哲学（用户原话级铁律）**：能构造 URL 绝不请求接口，能引用的绝不下载。
> 图片全部引用源站 URL，从不落盘；缓存目录全部 gitignore、用完可删；线上仓库只有 JSON。
> 不接 AI、不实时调外部站点——纯静态、可复现。

### 10.0 体积纪律（用户明确要求）

- 新增 JSON 前先估算体积；超过 1MB 就想瘦身手段：learners/拥有者名单截断（前端只显示前 80）、
  去冗余字段（如 learners 里的 src）、超长描述截断、同名条目合并。
- `inspiration-skills.json` 从 7.6MB 瘦到 4.8MB 的手段就是上面三条，可复用。
- 生成器的临时 HTML/JSON 一律放 `_tools/.xx-cache/`（点开头），**当天同步加进 .gitignore**。

### 10.1 四个参考数据源速览

| 源 | key | 站点 | 数量 | 图 | 独有内容 |
|---|---|---|---|---|---|
| 宝可梦 | `pk` | PokeAPI | 1025 | jsDelivr sprites 官方美术图 | 特性（284 个中文名+隐藏标记）、tags 分类标签、地区、世代图鉴介绍 |
| 洛克王国 | `rk` | rocokingdomworld.org | 644 | 源站直链 webp | 六维（hp/atk/**mag**/def/**res**/spe，注意键名与宝可梦不同） |
| 奥奇传说 | `aq` | aoqi.100bt.com | 1606 | 源站直链 png（**列表页图片在 `dsrc` 属性**，src 是懒加载占位图 loading28.gif） | 特长/普通技+特效/超杀技+特效/成长故事 |
| 赛尔号 | `se` | wiki.biligame.com/seer | 4978 | `Special:FilePath/立绘-{序号}.png` 构造 302 直链（零请求） | 六维 sa/sd、外号、简介、**专属魂印（`分类:魂印` + `?相关精灵` 关联，图标 `文件:魂印-{图标}.png`）**、**专属刻印（`[[分类:刻印]][[专属精灵::+]]`，`?专属精灵`=数字序号）**、进化链 2262 条 |

### 10.2 生成器逐个说明（_tools/gen-*.mjs）

**gen-pokemon-data.mjs**（→ pokemon-data.json）
- 抓 PokeAPI species+pokemon（缓存 `_tools/.pokemon-cache/species-*` 与 `pokemon-*`，中断重跑只抓缺的）。
- evolution_chain 端点建 540 条链映射 → 每只 `evo[]`（链上全部成员 id，按进化顺序）。
- 特性：ability 端点缓存（284 个），中文名查表，`abilities:[{name,hidden}]`。
- **tags 分类标签**（§0.5.1-22）：传说=is_legendary / 幻之=is_mythical / 最初的伙伴=STARTERS 硬编码
  （27 个御三家基础形态 id）/ 大器晚成=LATE_BLOOMERS 硬编码（准神 600 族 10 条线 32 只：
  147-149/246-248/371-373/374-376/443-445/633-635/702-706/782-784/885-887/996-998）。
  **绝不能用 growth_rate==='slow' 判定大器晚成——传说宝可梦同样是 slow（奈克洛兹玛事故）**。
- PokeAPI 语言代码是小写 `zh-hans`；图鉴版本字段取 `scarlet` 单版本。

**gen-rock-data.mjs**（→ rock-data.json）
- 列表页 `/zh/pokedex/` data-* 属性 + 详情页 `/zh/pokedex/{slug}`。
- 立绘锚定 `data-spirit-art` 属性（正则会误抓系别小图标）。
- 种族值标签带点（M.ATK/M.DEF）注意正则行首锚定的 alternation 要覆盖。
- 3 只地区形态（地鼠/遁鼠/遁地鼠）源站页面**本身没有六维表**（只公布 Total）——stats 空是诚实数据，
  前端有兜底提示，别试图"补抓"。

**gen-aoqi-data.mjs**（→ aoqi-data.json）
- 列表页单页全量 3547 条去重 1606；**真实图在 `dsrc` 属性**（src 是 loading28.gif 懒加载占位）。
- 详情页**三种版式自适应**：`aoqi__table01` 旧大表 / `tujianTable` 新表 / 无 class 手写表；
  tableRows 同时抓 `<td>` 和 `<th>`（新版表行标签在 th）。
- 只取**紧跟表头的连续数据行**（碰到 推荐/获得方式/速递 等栏目词停，防推广行串台技能）。
- `html.indexOf('精灵名')` 会命中 meta description——要遍历 table 找表头。
- clean() 必须补全 HTML 实体：&middot;/希腊字母 αβγπ/&hellip;（机甲小诺α是正经名字，不是乱码）。

**gen-seer-data.mjs**（→ seer-data.json）
- SMW 结构化属性：`api.php?action=parse&text={{#ask:[[分类:精灵]]|?序号|…}}`，limit 上限 1000，
  offset 分页，**4.5s 间隔防 WAF**；5 请求拿全 4978 只。
- **ask 参数必须写在 `{{#ask:…}}` 花括号内部**：把 |limit 追加到 `}}` 之后会静默失效（默认 limit=50，只拿到 50 条——要数行数才能发现）。
- biligame EdgeOne WAF：连发请求进惩罚期（HTTP 567，几分钟起），退避 180/360/540s 无效；
  正确姿势 = 4.5s 限速 + 缓存续抓 + 失败降级不阻断。
- 图片零请求：`https://wiki.biligame.com/seer/Special:FilePath/立绘-{序号}.png` 直接构造。
- 页面标题是 `精灵:{序号}`（特殊名如 神代·伊优 是 DisplayTitle）。
- **进化链**：wiki「进化链」属性是**空格分隔序号串**（`0010 0011 0012`）→ 按 `/[\s，,、]+/` 切分 →
  **去前导零**（0108 对齐 no=108，否则前端 byNo 反查失败）→ 过滤模板占位符（`{{{一阶段形态}}}`、
  `[[文件:…]]`）→ 单元素链视为无链。修复后 2262 只全可反查。
- **属性列剔除混入的精灵名**（「机械地面系 北冥·玄武」→ 截到第一个「系」）。
- 魂印/刻印批量：魂印 = `[[分类:魂印]]` + `?相关精灵`（**魂印ID 是魂印自己的编号，别当精灵序号用**）；
  刻印 = `[[分类:刻印]][[专属精灵::+]]` + `?专属精灵`（取值就是精灵数字序号）。
- wiki 的「技能名称」属性存的是序号文本——技能名用**效果第一小句截 10 字**做可读名。

**gen-inspire-extra.mjs**（→ inspiration-abilities.json + inspiration-skills.json）
- 宝可梦：ability/move 端点缓存（`_tools/.pokemon-cache/ability-*/move-*`）；move 可学精灵用
  `learned_by_pokemon`（不是 `pokemon` 字段），**截 80**（前端只显示 80）。
- 洛克：`/abilities/` 与 `/skills/` 页面**内嵌 `<script type="application/json">` 完整数据**
  （traits 224 含描述+spiritIds、skills 586、spirits 的 skills=[[技能id,'skills',等级]]）——无需逐页抓。
- 赛尔：技能 SMW 属性名是 `技能序号/技能名称/技能类型/技能属性/技能效果/威力/次数/先制/命中率`，
  **不是** `ID/名称/效果`；归属精灵不在 SMW → learners 空（前端显示暂无名单）；desc 截 200 字控体积。
- 奥奇：从 aoqi-data.json 直接提取，不新增请求。
- **finish() 去重规则**：按 `src|name` 合并 learners，**但赛尔技能名是效果摘要易重名 → se 技能改按 id
  去重**（否则 6000 合成 1279）；统一给 learners 去掉冗余 src 字段（模板只用 name/id/hidden/lv）。

### 10.3 每日精灵灵感页前端要点（tools/daily-pokemon.html）

- 归一化：normalizePk/normalizeRk/normalizeAq/normalizeSeer → 统一字段
  `src/id/no/name/types/stats/h/w/dex/dexSrc/img/evo/link/full` + 各源独有字段（abilities/soulSeal/engrave/talent/skills/tags…）。
- **STAT_LABELS/STAT_ORDER 按源映射**：pk=hp/atk/def/spa/spd/spe，rk=hp/atk/**mag**/def/**res**/spe，
  se=hp/atk/def/**sa**/**sd**/spe——键名错位会静默少列（赛尔六维 bug 的根因就是写成 spa/spd）。
- **mon 默认对象必须包含模板用到的所有字段**（防 Vue prod 静默炸）。
- 三卡各自日期种子（精灵/特性/技能独立），`reseedDaily()` 同时播种；数据源开关变化 → 重抽。
- jumpEvo/jumpLearner：按名字/序号在当前随机池找卡，兜底去 `[版本]` 前缀；找到后 scrollIntoView。
- **PRNG 铁律**：mulberry32 等自实现随机必须返回 [0,1) 小数——漏 `/4294967296` 会产出 0~43 亿整数，
  洗牌下标越界塞 undefined，Vue 生产版静默白屏（真实事故）。
- 已参照名录：scanPrototypes 建 `refPairs[{vowId,vowName,vowImage,vowTypes,origin,pet}]`；
  vow 图片 = site-config `imgCdnBase + vow.image + ?v=imgVer`（与 vowdex getImgUrl 同规则）。
- `srcMeta` 初始化必须整体从 SRC_META 带 label/color/favicon（曾只带 count 导致「出自」空白）。
- `.ex-icon` 有 overflow:hidden，内部绝对定位徽标（ex-src）不能用负 bottom——会被裁切一半。

---

## 11. 踩坑史速查（同类问题先查这里）

| 症状 | 根因 | 修复 |
|---|---|---|
| 后台 Vue 页整页白屏/弹窗不开，无报错 | setup return 漏项 / 解构漏项（生产版静默失败） | 核对 return 清单；用 test-admin-modal 验证 |
| 随机洗牌塞 undefined → 白屏 | 自实现 PRNG 漏 `/4294967296`，随机数是 0~43 亿整数 | PRNG 必须返回 [0,1) |
| 每日精灵卡某两维种族值消失 | 前端 STAT_ORDER 键名与数据键错位（spa/spd vs sa/sd） | 按源核对 STAT_LABELS/STAT_ORDER |
| 奥奇图片全是 loading28.gif | 列表页 src 是懒加载占位 | 真实图在 `dsrc` 属性 |
| 奥奇技能"串台"显示别的精灵的技能 | 表格尾部混入推广行 | 只取紧跟表头的连续数据行 |
| 进化链"乱码" | &middot;/希腊字母实体未解码 | clean() 补全解码表 |
| 赛尔 SMW 只拿到 50 条 | \|limit 写在 `{{#ask:…}}` 花括号外，静默失效 | 参数写进花括号内 |
| biligame 请求返回 HTTP 567 | EdgeOne WAF 惩罚期 | 4.5s 限速 + 缓存续抓 + 降级；退避等没用 |
| 赛尔魂印挂到错误精灵上 | 魂印ID 被当精灵序号（实际是魂印自己编号） | 用 `?相关精灵` 属性关联 |
| 赛尔进化链前端显示一坨数字 | wiki 存空格分隔序号串，生成器按顿号切 | 按空白切分 + 去前导零 + 过滤占位符 |
| 赛尔技能名是一串数字 | wiki「技能名称」属性存序号 | 用效果第一小句截 10 字做名 |
| 奈克洛兹玛误标「大器晚成」 | growth_rate==='slow' 对传说宝可梦同样成立 | 大器晚成 = 准神 600 族硬编码列表 |
| 卡片「出自 ·」空白 | srcMeta 初始化只带 count 漏 label/color | 整体从 SRC_META 初始化 |
| 特性卡徽标被裁一半 | ex-icon overflow:hidden + 徽标负 bottom 定位 | bottom:5px 移进容器内 |
| 改版后本地白屏线上正常（或反之） | css/js 缓存错位 | 升 `?v=`，Ctrl+F5 |
| 后台缩略图死活不更新 | jsDelivr 忽略 ?v= 且 @main 缓存 12h | 后台缩略图走 raw.githubusercontent.com |
| 页面内容改了同步了又变回去（三轮） | ① reconcile 拿 60s 缓存旧值 ② 点外部静默还原 ③ stale dirty mirror 整包同步回滚云端 | ① fetch 带 `?_=时间戳` ② 点外部=自动保存 ③ 三方合并防回滚（§7） |
| 数据仓 push 被拒 non-fast-forward | 远端有后台面板自动提交（Admin Panel: Update xxx） | `git pull --rebase` 再推 |
| 后台侧栏点精灵管理/天地图鉴不跳转 | data-tab 项无条件 preventDefault | 仅 index 页拦截 |
| 侧栏/导航高亮永远不亮 | CF 308 去掉 .html，isActive 匹配不上 | isActive 补 .html |
| `Cannot read properties of undefined (reading 'memo')` 白屏 | CDN 全量包用了 v-memo | 禁 v-memo，抽子组件 |
| 表格 hover 泛白 | tr 背景触发整行重绘 | hover 只改 td 背景；表头禁 transition: background |
| 全屏遮罩掉帧 | backdrop-filter 整屏模糊 | 遮罩默认无模糊，仅 body:not(.no-anim) 启用 |
| 图片管理破千丢图 | Contents API 1000 条静默截断 | listDirectory 自动切 Git Trees API |
| 下拉点外面不关 | 事件时序 | vow-select 捕获阶段 pointerdown |
| 自定义境界名后 RANK_SCOPE 失配 | 权柄阶元映射按名字写死（初灵↔初生…元灵↔掌元） | scopeNote 字段兜底；改名时提醒用户填 scopeNote |
| 生成数据体积暴涨 | learners 全量存储 / 冗余字段 | 截 80、去 src、截断描述（§10.0） |
| 文档说图片缓存 1 小时，换图却半小时不变 | `functions/img` 实际是 `CACHE_TTL=604800`（7 天 immutable），README 写错 | 文档已改成 7 天；换图改 `imgVer` 或加 `?v=` |
| 文档说"后台别传 fresh"，打开后台却每次转圈 | 7 个后台脚本实际传了 `{fresh:true}` | 文档已按现状重写（要秒开就不传，要最新就传） |
| 文档里的后台路径 `admin-reference/xxx` 打不开 | 目录树是重组前的旧结构 | 已全部改为平铺的 `admin/admin-xxx.html` |
| 按文档算境界（升灵 16-36）与站内推导不符 | README 写 16-36/37-50，`stages-data.json` 是 16-35/36-50 | 以数据文件为准；文档已修正 |
| 新页跑不进手机审计 | `audit-mobile.mjs` 的 PAGES 是手写清单，新增页不会自动加入 | 新增页面当天补进 PAGES（42 页现已齐全）；审计读 `innerText` 判「未编译模板」时要排除 `#vowmon-boot` 加载遮罩，否则数据没回来时会误报 |
| 数据回来前闪一下 `{{ }}` 未编译模板 | `[v-cloak]{display:none}` 原先只写在 `css/admin.css`，前台只引 `style.css` 的页面没有这条规则 | `css/style.css` 已补全局 `[v-cloak]{display:none!important}`；新页 `#app` 建议直接加 `v-cloak`（Vue 挂载后会自动摘掉，不会把页面藏死） |
| 同款组件在不同页行为不一致 | 10 个页面引的是 `vue@3` 裸版本（会随 CDN 漂移），其余页锁 `3.5.13` | 全站统一锁 `vue@3.5.13/dist/vue.global.prod.js`，新增页照抄这条 |

---

## 12. 御兽世界设定观（世界观正典）

> **重要概念区分**：**御兽精灵（individuals-data.json 的个体）** 才是书里正式存在的精灵，权柄 / 血脉 / 契约状态等只属于个体；**精灵图鉴（vow-data.json）** 只是种族图谱，展示所有可能的精灵，不承载个体属性。两者靠 `speciesId` 关联。做功能时先想清楚数据属于哪一层——把权柄挂在图鉴种族上是概念错误（曾发生过，现已修正）。

> 以下内容是**小说的世界观设定**，站点的数据结构、页面、文案全部围绕它构建。
> 正文原文存于 `lore-data.json`（362 块），本节是结构化摘要 + AI 理解用的解读。

### 12.1 世界基础：元域与三律

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

### 12.2 等级体系：八阶双轨（精灵 ↔ 御兽师一一对应）

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

### 12.3 御兽师体系：三维立身

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

### 12.4 血脉体系：石之共鸣

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

### 12.5 势力版图：联盟治世

- **地区划界**：世界按**地区**划分，每个地区有自己的**联盟**（政治军事分立）。已知主要地区：
  **九牧地区**（故事主舞台），由**九牧联盟**治理。
- **荒野（WILDS）**：地区之外的法外之地，邪恶势力藏身所；穿越荒野的商队须雇职业级以上护卫，
  且没人保证活着回来。
- **权职体系**（名号与实力并行）：**盟主**（政治最高）｜**戎枢**（军事最高）｜**大冠**（地区最强
  训练家，攀登终点）｜**太宰**（地区四大承相合称）｜**首座**（各属性最强枢座，一属性一座，
  十八系各争其位）｜**大君**（同时兼任政治+军事最高者）。
- **三大协会**：精灵协会 / 御兽师协会 / 学术协会。
- 数据落点：`characters-data.json` 的 factions/groups 自定义列表 + `characters[].faction`。

### 12.6 十八生态界演化史（world/lore.html，传世石板）

创世叙事：元创造世界 → 三颗种子（火草水）→ 万物演化：草茂生**虫**、腐朽生**毒**；火烧山野，
灰烬化**岩**与**地**，烟尘孕**飞行**；水极寒结**冰**、水面招**电**；岩石被地火熔炼成**钢**。
生灵之变：**超能力**（精神超脱）、**幽灵**（死后执念）、**一般**（无元素天赋）、**格斗**（极致搏杀）、
**恶**（生存诡计）。**龙蛇之变**：泥土中的【蛇】不甘匍匐——借水化蛟、入火生翼、交融剧毒死气、
百炼成钢，剥离一切借来的躯壳自诩为**龙**。**立于龙上之物**：来自星月的微光（**妖精**）能让龙的
法则在嬉笑间化为虚无——巨龙立于众生之上，它们立于巨龙之上。
**石板尾声伏笔**：界壁外有不属于自然演化的"异端"虎视眈眈；龙族真的毫无弱点吗？——等【元】归来的
那一天，别交出不及格的答卷。（隐藏石板章节在页面里默认模糊锁定，点击解锁。）

### 12.7 天地图鉴：精灵定位四类

`realm-data.json`（页面 `dex/realm-dex.html`，后台在 admin/index 的「天地图鉴」Tab）：

| 定位 | 含义 |
|---|---|
| 权柄精灵 | 能执掌世界规则的精灵，天地秩序基石，有名号与定位（对应【权】） |
| 遥世精灵 | 栖身偏远秘境与人类世界隔绝，绝大多数训练家终生无缘 |
| 伙伴精灵 | 亲和易建立羁绊，新人启程搭档（对应"御兽精灵"获取途径） |
| 晚熟精灵 | 前期平平，后期解锁潜藏力量 |

数据字段：`vow.realmTags`（数组，多选）。图鉴另有 `rank`（评级：初灵/升灵/族尊等设定内分级）。

### 12.8 书内档案（数据模型对应）

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

### 12.9 术语表（写文案/代码注释时对齐）

元域（世界）· 元（创世神）· 力/位/权（三律）· 权柄（生态界管理员账号）· 托举/摇人/放权（三大机制）·
血脉之石 · 共鸣 · 技能核心（精神构建）· 御兽空间 · 联盟币（货币）· 九牧地区/九牧联盟 · 荒野 ·
大冠/太宰/首座/大君/盟主/戎枢（权职）· 榨精杯（测试道具）· 生态界震动（元灵不出手时的强制改克制）

---

## 13. 奇思妙想与待办池（对话中用户提过/预留的）

- **地区形态精灵**：用户明确提过"后续可能还有地区形态的精灵"——`form` 字段已有
  主形态/地区形态/首领形态三值，region 字段（多选）已就位，做地区形态时可直接复用。
- **精灵果实页**：导航占位 `soon: true`；物品 `kind` 已有「精灵果实」大类。
- **十八生态界页**：导航占位 `soon: true`（元域演化史页里已有"界壁外的异端"伏笔可承接）。
- **对战模拟器**：已完成引擎+页面；机制全部由技能效果文案关键词解析——**加新机制优先改文案关键词**。
- **卡片导出**：`card-export.js` 可把数据渲染成 TCG 卡 PNG（霞鹜文楷正文+思源宋体卡名）。
- **taxonomy 进化链共用**：域界门纲目科属种——同一进化链上的精灵保存时 BFS 自动同步共用一套。
- **榨精杯 / 修炼三法 / 御兽天赋**：世界观已有设定，尚未做成图鉴条目（可进物品图鉴/新页）。
- **赛尔号技能归属精灵**：源站 SMW 没有结构化的归属数据（技能卡 learners 空，显示暂无名单）；
  如果要补，可行路径是抓 4978 个精灵页 wikitext 的 `技能=` 字段反查（成本高，WAF 严格，先问用户）。

---

## 14. 参考资料与外部链接（搜集整理）

| 用途 | 地址 | 说明 |
|---|---|---|
| 宝可梦机制百科 | https://wiki.52poke.com/wiki/首页 | 对战引擎的官方依据：伤害公式、能力变化 ±6、异常状态、天气场地、优先度、击中要害 1/24。**本站机制的权威参考**；分类页（大器晚成/最初的伙伴/传说的宝可梦）是标签判定的权威依据 |
| PokeAPI | https://pokeapi.co | 宝可梦参考数据源；语言代码小写 `zh-hans`；move 用 `learned_by_pokemon` 拿可学精灵 |
| 洛克王国世界 | https://rocokingdomworld.org | 洛克数据源；`/abilities/` `/skills/` 页面内嵌完整 JSON |
| 奥奇传说大全 | http://aoqi.100bt.com | 奥奇数据源；图片在 `dsrc` 属性 |
| 赛尔号 BWIKI | https://wiki.biligame.com/seer | 赛尔数据源；SMW ask 批量；有 WAF（4.5s 限速）；`Special:FilePath` 构造图片直链 |
| 洛克王国 4399 | https://news.4399.com/luoke/ | `vow-detail.html` / `skill-detail.html` 的 wiki 布局参照来源（展示台+种族值+进化链+克制卡的版式观感） |
| Vue 3 文档 | https://vuejs.org/guide/ | CDN 全量包固定锁 **`vue@3.5.13/dist/vue.global.prod.js`**（全站统一，禁止写 `vue@3` 裸版本）；**内联模板运行时编译，遵守 §5 白屏铁律** |
| Font Awesome 6.4 | https://fontawesome.com/v6/search | 全站图标唯一来源（`fa-solid fa-*`） |
| Inter 字体 | jsDelivr CDN | 变量字体；中文交给系统字体栈（HarmonyOS/MiSans/思源黑体/苹方/雅黑），**禁 Google Fonts Nunito（被墙）** |
| Cloudflare Pages 文档 | https://developers.cloudflare.com/pages/ | Functions（`functions/`）、`_routes.json`、`_headers`、Custom domain 登记 |
| GitHub REST API | https://docs.github.com/rest | Contents API（1000 条上限）、Git Trees API（兜底）、Fine-grained Token（只存 localStorage） |
| jsDelivr | https://www.jsdelivr.com/ | 数据兜底源；注意 @main 12h 缓存且忽略 query —— 只用作前台兜底，后台缩略图禁用 |
| 霞鹜文楷 / 思源宋体 | 各 CDN | 仅 `card-export.js` 卡片导出用 |

**数据源候选**（site-config 可切换）：CF 反代 `https://vowmon.pages.dev/data`（默认）→
`https://cdn.jsdelivr.net/gh/luo029/vowmon_data@main` → `https://raw.githubusercontent.com/luo029/vowmon_data/main`。

---

## 15. 给新 AI 的第一分钟清单

1. **先读 §0.5**（用户要求全记录）——那是这个项目的"用户手册"，所有显式命令与行事风格都在里面。
2. 读 §0–§3（是什么、仓库分工、数据链路）。
3. 用户在谈某个页面 → 查 §4/§5 表格定位文件，再读对应 HTML/JS。
4. 用户在谈数据不对 → 先分清是**站点代码**还是 **vowmon_data 数据**的问题；再分清是**站点自有数据**
   还是**外部参考数据**（外部参考数据改 `_tools/gen-*.mjs` 重跑，见 §10；注意生成前 `git pull --rebase`）。
5. 用户在谈世界观/写小说 → 查 §12；改世界观正文走后台 admin-lore 或直接编辑 lore-data.json
   （注意三方合并快照 `vowmon_lore_lastpush` 只在用户浏览器里，改仓库不会冲突）。
6. 改完 → 本地 `dev-server.py` + 相关 test 脚本验证（或按用户授权跳过）→ 升 `?v=` →
   commit+push（两仓分别推）→ 追加工作日志（自己 `agents/<agent>/` + `CHANGELOG.md` 一行）→ 报告用户。
7. 拿不准时看 `git log --oneline` 最近的提交信息——本仓库提交信息写得非常详细，是活的历史；
   再看 `.doubao/memory/` 下的 `MEMORY.md`、`CHANGELOG.md` 与各 agent 日志（规则见该目录 `README.md`）。
8. 遇到没见过的怪现象 → 先查 §11 踩坑史速查表，九成问题都发生过。
