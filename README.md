# Vowmon Wiki

Vowmon（契约精灵）的非官方设定 Wiki 与数据工具站。  
纯静态站点，Vue 3 CDN 版驱动，GitHub Pages / Cloudflare Pages 托管。

---

## ⚠️ 核心开发规范 (给 AI 的备忘录)

1. **命名规范**：官方英文名 **Vowmon**，图鉴英文 **Vowdex**。**「精灵」的英文统一叫 Vowmon**（数据源即数据仓库里的 `vow-data.json`，代码里的全局变量仍为 `allPetsData`）。禁止使用 Pokedex / Pokemon / pets 作为对外名称。
2. **代码输出格式**：所有生成的代码必须使用 ` ```text ` 代码块，**禁止使用高亮**。代码文件名写在代码块上方。严禁使用省略号。
3. **目录规范**：**按文件类型分文件夹**——`css/`、`js/`；前台 `.html` 页面留在根目录，**后台页面统一放 `admin/` 子目录**；`functions/` 只放 Cloudflare Pages Functions。**站点仓库不存数据**（数据在 `vowmon_data`），禁止再新增 `assets/`、`pages/`、`data/` 之类的目录。
4. **性能与动效**：全站默认开启过渡动画，但必须受 `localStorage.getItem('vowmon_anim_on')` 控制。当值为 `'false'` 时，不应有任何动画。
5. **属性统一**：所有属性的图标和颜色存放在 `js/type-config.js`，全局引用。
6. **禁止系统弹窗**：任何 `alert()` / `confirm()` / `prompt()` 都不允许出现，统一换成自定义弹窗 `VowmonDialog`（`js/dialog.js` + `css/dialog.css`，用法见 1.2）。
7. **性能红线**：所有页面都是 **Vue CDN 全量包 + HTML 内联模板（运行时编译）**，因此 **禁止使用 `v-memo`**（会在首次渲染直接抛 `Cannot read properties of undefined (reading 'memo')` 把页面炸成白屏）；要隔离重渲染就抽子组件（模板字符串写在 JS 里 + `app.component` 注册），表格类子组件直接输出完整 `<table>`，别用 `is="vue:xxx"` 塞进 `<table>`（HTML 解析会把节点提升出去）。**禁止在全屏遮罩上用 `backdrop-filter`**（列表滚动每帧重算整屏模糊，必掉帧）。详见 §3.7。

---

## 1. 目录结构

```text
vowmon/
├── index.html              # 首页
├── vowdex.html             # 精灵图鉴
├── list.html               # 精灵列表
├── skills.html             # 技能图鉴
├── skill-detail.html       # 技能详情（?id=技能id，列出可学精灵：自学 / 技能石）
├── lore.html               # 元域演化史（世界观史诗页面，纯静态文本 + 星空卷轴风）
├── traits.html             # 特性大全
├── natures.html            # 性格大全
├── items.html              # 物品图鉴（列表 + 详情）
├── calculator.html         # 属性克制计算器
├── coverage.html           # 打击面计算器
├── README.md               # 本文件
├── .nojekyll               # 让 GitHub Pages 跳过 Jekyll 处理
├── _headers                # Cloudflare Pages 响应头（静态资源缓存策略）
├── _routes.json            # Cloudflare Pages：只让 /img/* 进 Functions
│
├── .github/workflows/      # push 到 main 自动部署 Cloudflare Pages
├── functions/img/[[path]].js  # CF Pages Function：图片反向代理（见 §4.3）
│
├── admin/                  # 后台（子目录，资源引用带 ../ 前缀）
│   ├── index.html          # 后台 - 精灵管理（原 admin.html，网址 /admin/）
│   ├── admin-skills.html   # 后台 - 技能管理
│   ├── admin-traits.html   # 后台 - 特性管理
│   ├── admin-items.html    # 后台 - 物品管理
│   └── admin-images.html   # 后台 - 图片管理
│
├── css/                    # 所有样式
│   ├── style.css           # 前台统一样式
│   ├── navbar.css          # 全站导航栏样式（唯一来源）
│   ├── common-ui.css       # 通用组件样式（弹窗、表单、选择器）
│   ├── dialog.css          # 自定义弹窗 / 轻提示样式（配套 js/dialog.js）
│   ├── admin.css           # 后台布局样式
│   └── responsive.css      # 全站移动端适配（最后引入，唯一来源）
│
├── js/                     # 所有脚本
│   ├── navbar.js           # 全站导航栏内容与交互（唯一来源）
│   ├── type-config.js      # 属性配置（名称 / 图标 / 颜色）
│   ├── category-config.js  # 技能分类配置（物理 / 特殊 / 变化：名称 / 图标 / 颜色，唯一来源）
│   ├── tag-config.js       # 技能标签配置（回血 / 先手 / 异常…：名称 / 图标 / 颜色，唯一来源）
│   ├── item-config.js      # 物品配置（大类 Tab + 分组胶囊：名称 / 图标 / 颜色，唯一来源）
│   ├── type-chart.js       # 18×18 属性克制表 + 组合倍率计算
│   ├── vowmon-utils.js     # 前台数据规整（normalizeAll / total）
│   ├── github-api.js       # GitHub API 封装
│   ├── image-utils.js      # 图片上传前处理：压缩 / 等比缩放 / 统一输出 PNG
│   ├── dialog.js           # 自定义弹窗 + 轻提示（window.VowmonDialog，替代 alert/confirm）
│   ├── admin.js            # 精灵后台逻辑
│   ├── admin-skills.js     # 技能后台逻辑
│   ├── admin-traits.js     # 特性后台逻辑
│   ├── admin-items.js      # 物品后台逻辑
│   ├── admin-images.js     # 图片管理逻辑
│   └── data-loader.js      # 数据加载器（唯一的取数入口，见 §2）
│
└── functions/              # Cloudflare Pages Functions
    ├── data/[[path]].js    # /data/* 反代 vowmon_data 的 JSON
    └── img/[[path]].js     # /img/*  反代 vowmon_imgs 的图片
```

**引用路径举例**（前台页面在根目录，带文件夹前缀；后台页面在 `admin/` 里，本地资源带 `../` 前缀）：

```text

<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="css/navbar.css">
<script src="js/navbar.js" defer></script>
<script src="js/type-config.js"></script>
<script src="js/category-config.js"></script>
<script src="js/tag-config.js"></script>
<script src="js/data-loader.js"></script>


<link rel="stylesheet" href="../css/admin.css">
<script src="../js/data-loader.js"></script>

```



> 新增前台页面放根目录，新增后台页面放 `admin/`；新增的 css 放 `css/`，js 放 `js/`。**数据不要放进来**——需要数据就在页面里用 `VowmonData.ready([...])` 拉取。



---

## 1.05 功能与分类说明（面向使用者）

本节用大白话说明这个站点每一页是干什么的、数据里那些分类分别代表什么，方便维护数据和写文案时对齐口径。

### 1.05.1 前台页面（给访客看的）

- **首页 index.html**：站点门面。一张 Hero 横幅介绍「Vowmon Wiki」，下面两张入口卡片分别导向「查阅图鉴」和「研究工具」。
- **精灵图鉴 vowdex.html**：以卡片墙的形式展示所有精灵，每张卡片有立绘、编号、名字、属性图标和六维能力。适合快速浏览、按形态翻页。支持：
  - 按名称 / 编号搜索；
  - 按「精灵阶数」「精灵形态」「属性」多选筛选（同组可多选，不同组同时满足）；
  - 分页浏览，顶部实时显示「共 X 种形态」。
  - **异色悬停**：没有异色图的卡片，鼠标悬停是原来的「上浮 + 图片放大」动效；有异色图的卡片，悬停时**不再放大**，而是淡入异色立绘。一只精灵有多张异色图时，持续悬停会按 #1 → #2 → … 顺序轮播（关掉动画开关后只固定显示第一张）。异色图加载失败会自动隐藏，不会盖成破图。
- **精灵列表 list.html**：和图鉴同源数据，但换成**表格**呈现，适合查询和对比。支持自定义「显示哪些列」、按列排序、与图鉴类似的多条件筛选。精灵名称列居中显示；「属性」列用**胶囊**展示，胶囊里是「属性图标 + 属性名称」（颜色取自 `js/type-config.js`）。
- **技能图鉴 skills.html**：表格展示全部技能，列依次为技能名称 / 技能属性 / 技能类型 / 能耗 / 威力 / 技能效果（**表格不显示标签列**，标签只用于筛选）。属性 / 分类用「图标 + 文字」的小胶囊呈现。顶部是筛选面板：
  - 搜索框：可搜技能名称、效果文案、标签名；聚焦有高亮描边，输入后出现一键清空按钮。
  - 四组筛选：**技能类型**（物理 / 特殊 / 变化）、**能耗**、**技能标签**、**技能系别**（属性）。每组选项都带数量角标；组内多选取并集（OR），组间同时满足（AND）。
  - 能耗与系别的可选项从现有数据自动派生——新增技能用了新能耗 / 新属性，筛选按钮会自动出现，无需改代码。**技能标签只显示数据中实际用到的**（按使用次数降序），后台给技能设置了几个标签就出现几个，不会列出 `tag-config.js` 里全部预定义标签。
  - 表头可点击排序：点击「技能名称 / 技能属性 / 技能类型 / 能耗 / 威力」按该列排列（能耗、威力按数值大小，属性按图鉴顺序，名称按拼音），再点切降序，第三次恢复原序，箭头指示当前方向。
  - 顶部实时显示「共 X 条」结果数，可一键「清空筛选」。
  - **技能名可点击**：点技能名跳到 `skill-detail.html?id={技能id}`。
- **技能详情 skill-detail.html**（布局参照洛克王国 wiki，`?id={技能id}`，兼容旧写法 `?name={技能名}`）：
  - **左列**：技能图标块（类型色渐变 + 分类图标）、名称、属性 / 分类 / 标签胶囊、技能效果、威力 / 耗能，以及「学习方式统计」卡（自学 N 只 / 技能石 N 只）；
  - **右列**：可学精灵网格，带「全部 / 自学 / 技能石」筛选 Tab（含数量）、名称 / 编号搜索、每页 35 只分页；
  - **卡片**：`NO.编号` + 学习方式角标（✦自学 / 💎技能石）+ 立绘 + 名字 + 形态 + 属性图标，点击跳 `list.html?q={精灵名}`；
  - 技能不存在或链接失效有兜底提示，不会白屏。
- **特性大全 traits.html**：表格展示全部特性（ abilities ）。支持搜索与按关联属性筛选，并列出每个特性「拥有该特性的精灵」。
- **性格大全 natures.html**（布局参照洛克王国 wiki，数据采用宝可梦 25 性格，仅保留能力修正部分）：
  - 性格影响能力值：一项 **+10%**、另一项 **-10%**；另有 5 种中性性格（勤奋 / 坦率 / 害羞 / 浮躁 / 认真）无任何修正。
  - **性格速查表**：横轴「降低的能力」× 纵轴「提高的能力」的 5×5 矩阵，交叉格显示对应性格，点击可定位到卡片；下方列出 5 种中性性格。
  - **性格卡片**：每张显示中文 / 日文 / 英文名、能力修正（如「攻击 +10% / 特攻 -10%」）。
  - 筛选：按「提高的能力 / 降低的能力」多选，以及按名称（中 / 日 / 英）搜索。
  - 数据唯一来源是 `vowmon_data/natures-data.json`（`natures` → `allNaturesData`、`stats` → `natureStats` 能力配色），为只读数据，不由后台同步覆盖。
- **物品图鉴 items.html**：物品的浏览与详情页，列表 / 详情是同一个页面（`items.html?id=i001` 直达某件物品，前进后退可用）：
  - **列表**：顶部大标题 + 「已筛 / 当前大类总数」计数；搜索（名称、描述、获取方式、分组都会命中）；分组胶囊筛选（只显示数据里实际有物品的分组，带数量角标）；`默认 / 名称 / 分组` 三种排序。
  - **大类 Tab**：数据里出现两个及以上的「物品 / 精灵果实 / 精灵蛋」时才显示，只有一个大类时自动隐藏。
  - **卡片**：左侧是图标（有图片用图片，没有则用图标字体 + 主题色），右侧是名称与两行描述，整卡可点。
  - **详情**：面包屑（← 物品图鉴 / 分组）→ 大标题 → 详情卡（左大图标，右侧从上到下为「细分类 → 描述 → 分割线 → 获取方式（可多条，带定位点小图标）」）→ **继续看看**（同分组的其它物品优先，最多 4 条）。
- **属性克制计算器 calculator.html**：查属性相克的工具。分「防守面」（某属性的精灵怕什么、抗什么）和「进攻面」（某属性的技能打谁翻倍、打谁减半），底部可展开 **18×18 完整克制表**。
- **元域演化史 lore.html**（导航「图鉴 → 世界观 → 元域演化史」）：世界观史诗阅读页，**纯静态、不拉数据**。深色星空卷轴风格（CSS 渐变星点，无背景图、无循环动画），正文按「传世石板」分章呈现（创世录四章 + 终章）。约定：
  - 正文里的 `【X】` 关键词由页面脚本自动渲染成胶囊：十八属性（含简称 `岩`→岩石、`地`→地面，颜色/图标取自 `js/type-config.js`）用属性色 pill；概念词（元 / 元域 / 力 / 位 / 权 / 蛇）用紫金「神秘」pill。**以后往正文里加新 `【属性】` 无需改代码**，加新概念词要在页面脚本 `metaWords` 里补。
  - 「隐藏石板」章节默认模糊锁定，点「触摸石板」解锁（纯 CSS blur 过渡）。
  - 章节卡片滚动进入视口时淡入（IntersectionObserver），受 `vowmon_anim_on` 控制：关闭时直接全部显示，不留 opacity:0。
  - 该页是全站唯一的深色底页面，是有意为之（史诗氛围），不算风格破坏；新增世界观类页面可沿用这套模板结构。
- **打击面计算器 coverage.html**：组队/配招研究工具。最多选 5 个技能属性，统计这套组合能覆盖 18 单系 + 153 双系共 **171 种属性组合**中的多少种，并分档报告（4 倍克制 / 2 倍克制 / 免疫 / 双重抵抗 / 抵抗）。

### 1.05.2 后台页面（维护数据用的）

> 四个数据编辑弹窗（精灵 / 技能 / 特性 / 物品）末尾都有一个 **「原型」** 输入框，用来写「取材自哪里」，自由文本、**默认留空**，不填不影响任何功能。

- **admin/index.html（网址 `/admin/`）**：精灵管理 + 同步配置（同一页两个 Tab）。增删改精灵、配置「显示列」、一键同步数据到 GitHub。
  - **上传即压缩 + 自动命名**：本地选图后先经 `js/image-utils.js` 处理——等比缩放（最长边不超过「同步配置 → 上传压缩尺寸」，默认 512，可选 256 / 512 / 768 / 1024），统一转成 **PNG**（保留透明底），小图不放大、不裁切（非正方形补透明边）。文件名强制按编号生成：主图 `sprites/{编号}.png`，异色 `sprites/{编号}_s.png`、`_s2`、`_s3`…；原文件名与后缀一概忽略。保存时若改过编号，会把本次上传的图按新编号重传并删掉旧文件（仅限本次会话上传过的图，手填路径/刷新过页面则保持原路径）。
  - **异色图片**：表单里「精灵图片」下方多一个「异色图片」区块，可**多张**维护。支持一次选多个文件上传（串行上传），也支持手填外链 / 路径后点「添加」；缩略图按 #1、#2… 排序，可单张移除。异色图存在精灵对象的 `shiny` 数组里，**不占编号、不生成独立条目**，后台列表也不额外显示。
  - **特性槽位**：一只精灵可填「特性 1 / 特性 2（多特性随机）/ 隐藏特性」，每个都有独立的效果说明框，不填即为空。
  - **进化链**：表单里有「进化自 / 进化为」两个多选（一阶 → 二阶 → 三阶）。保存时会**双向自动补链**——A 填了「进化为 B」，B 的「进化自」自动出现 A，反之亦然；存的是精灵 `id`（旧数据里的单个 id 字符串会自动转成数组）。
  - **编号规则**：新建时默认编号 = 现有编号里的**最大数字 + 1**，但允许任意跳号（比如 001–009 之后直接填 401，下一个默认就是 402，中间空号不会自动补）。只做唯一性校验，不要求连续。
- **admin-skills.html**：技能管理。增删改技能（属性单选胶囊、分类下拉、标签选择器）、配置「显示列」（含「标签」列）、一键同步。
  - **可学精灵选择器**：编辑弹窗里可勾选「能学会这个技能的精灵」。工具栏是「搜索框（名称 / 编号）+ 全选 / 取消全选」，下面一排属性胶囊做筛选，再下面是可滚动的勾选网格（上千只精灵也不会卡）。已选数量实时显示。
  - **学习方式（自学 / 技能石）**：勾选后默认归**自学**（`learners[]`，自我觉醒领悟）；已勾选的行右侧有「自 / 石」小按钮可一键切换成**技能石**（`stoneLearners[]`，必须靠技能石学会）。全选只加入自学，取消全选两组一起清。表格「可学精灵」列显示总数 + 💎 石学数量徽标。
  - **标签选择器**：不再平铺全部标签，而是「已选胶囊 + 搜索框 + 候选下拉」。输入关键字搜索标签并点选；搜不到时可按回车 / 点「新建」直接创建自定义标签；每个候选标签右侧的垃圾桶图标可删除该标签（会同时从所有技能中移除）。标签库变动会即时持久化。
- **admin-traits.html**：特性管理。增删改特性、配置「显示列」、一键同步。
  - **拥有精灵（芯片式）**：选精灵弹窗里勾选后，以芯片形式列在表单中，每片可切「普通 / 隐藏」（★）。普通存 `pokemons[]`、隐藏存 `hiddenPokemons[]`。
  - **与精灵库双向互通**：特性管理里选精灵 → 保存时反向写入该精灵的 `ability2` / `hiddenAbility`；精灵管理里改特性 → 保存时反向写入特性库的 `pokemons` / `hiddenPokemons`。两边读写同一份数据，不会各说各话。
- **admin-items.html**：物品管理。表格展示图标 / 名称 / 类型 / 分组 / 获取方式 / 描述，支持「显示列」（状态存在 `localStorage['vowmon_items_visible_cols']`）、增删改、一键同步 `items-data.js`。
  - 表单字段：名称、类型（大类 Tab）、分组（筛选胶囊）、细分类、图标（图片 / 图标字体 + 主题色二选一）、描述、获取方式（**一行一条**，保存时拆成数组）。
  - 图标上传走和精灵图一致的压缩流程（`js/image-utils.js`），存为 `items/{id}.png`；不传图片就用图标字体，`颜色` 决定图标颜色。
  - 名称会做重复校验；新建时 id 自动生成为 `i001`、`i002`…，仅用于深链和图标命名，不在前台显示。
- **admin-images.html**：图片管理。双标签设计——「仓库图片」扫描并管理所有图片仓库里的图（异色图会计入使用方，标注为「某某（异色）」，不会误报成未使用）；「精灵图片」核对每只精灵的图片是否真实存在，卡片标题上会带「异色 ×N」角标，支持上传 / 删除 / 绑定到精灵。

### 1.05.3 数据里的分类口径

维护数据时请沿用以下取值，不要自造新叫法：

- **属性（type）**：共 18 种——一般、格斗、飞行、毒、地面、岩石、虫、幽灵、钢、火、水、草、电、超能力、冰、龙、恶、妖精。图标、颜色只在 `js/type-config.js` 维护；相克关系只在 `js/type-chart.js` 维护。
- **技能分类（category）**：只有三类，取值为 **物理 / 特殊 / 变化**（旧数据里的「物攻 / 魔攻 / 防御 / 状态」在前后端加载时会自动映射成这三类）。每类都有专属图标，取自 `js/category-config.js`：物理是橙红放射星芒、特殊是蓝色同心圆、变化是灰色阴阳图（对应官方 Physical / Special / Status 的观感）。
  - 物理：靠身板打的招式，吃「攻击 / 防御」能力值；
  - 特殊：靠能量打的招式，吃「特攻 / 特防」能力值；
  - 变化：不直接造成伤害，用于回血、增益、削弱、施加异常等，`power` 通常填 0。
- **技能标签（tags）**：字符串数组，可多选，描述技能的效果特征（如 `回血` / `先手` / `灼伤`）。没有标签就填 `[]`。标签库由内置标签（`js/tag-config.js` 的 `BUILTIN_TAG_DATA`，23 个）+ 后台新建的自定义标签组成，完整库持久化在 `localStorage['vowmon_tags_library']`，前后台同源共享；后台「技能管理」可搜索 / 新建 / 删除标签。**前后台加载技能时都会保留所有字符串标签，不再按内置列表过滤**——所以自定义标签不会被清掉。若访客浏览器没有该 localStorage（如公网部署），未知标签会按名称 hash 生成稳定的图标与配色（`getTagInfo` / `autoTagStyle`），展示与筛选均正常。
- **精灵阶数（stage）**：一阶 / 二阶 / 三阶，对应进化阶段。
- **精灵形态（form）**：主形态 / 地区形态 / 首领形态。
- **精灵评级（rank）**：如初灵、升灵、族尊等设定内分级。
- **技能学习方式（learners / stoneLearners）**：两个**精灵名字符串数组**，都为空表示「暂无精灵可学」，`learners` 里的键缺省时按 `[]` 处理。
  - `learners[]`：**自学领悟**——精灵自我觉醒 / 升级就能学会；
  - `stoneLearners[]`：**技能石学习**——必须靠技能石才能学会，不能自学；
  - 同一个精灵名不要同时出现在两个数组里（后台切换「自 / 石」时会自动从另一组移除）。前台 `skill-detail.html` 的「全部 / 自学 / 技能石」就是按这两个数组拆的。
- **原型（origin）**：精灵 / 技能 / 特性 / 物品都支持这个字段，**自由文本、默认空字符串 `''`**，用来记录「取材自哪里」（参考了哪部作品、哪个神话生物、哪个现实物品…）。只在后台录入与保存，不参与任何筛选和校验；旧数据没有这个字段时加载会补成 `''`。修改入口都在各编辑弹窗里，标签文字统一为「原型 · 取材自哪里，可留空」。
- **特性（ability / trait）**：特性库用 `pokemons[]`（普通特性拥有者）+ `hiddenPokemons[]`（隐藏特性拥有者）反查「哪些精灵拥有它」。精灵侧对应 `ability` / `abilityEffect`（特性 1）、`ability2` / `ability2Effect`（特性 2，多特性随机）、`hiddenAbility` / `hiddenAbilityEffect`（隐藏特性）。**两边保存时会自动双向同步**；旧数据缺 `hiddenPokemons` 会在加载时统一补成 `[]`，手改数据也请保持这两个数组存在。
- **六维能力（stats）**：`hp`（HP）、`atk`（攻击）、`def`（防御）、`spAtk`（特攻）、`spDef`（特防）、`spd`（速度）。
- **异色图（shiny）**：精灵对象上的**字符串数组**，存该精灵的异色立绘路径 / 外链，按顺序即展示顺序（`shiny[0]` 是第一张）。没有就填 `[]`（旧数据没有这个字段也兼容，前端按空处理）。约定：
  - **不占编号**：异色不是独立条目，不新增 `id`、不进图鉴计数、列表也不多一行；
  - 后台上传的命名规则是 `sprites/{编号}_s.png`（如 `401_s.png`），第二张起依次 `_s2`、`_s3`；旧数据里的 `_shiny{n}` 依然能识别，取序号时会跳过已被占用的；
  - 上传的图统一压缩为 PNG，尺寸受「同步配置 → 上传压缩尺寸」控制；
  - 只有图鉴卡片用得到它——有异色的卡片悬停显示异色图，没有的保持原来的放大动效。
- **物品（item）**：`vowmon_data/items-data.json` 里的 `items` 数组（同文件还有 `kinds` / `groups` / `categories` 三组自定义列表），字段如下：
  - `id`：`i001` 这类内部编号，只用于深链（`items.html?id=i001`）与图标命名，**前台不展示**；
  - `name`：物品名（名称做重复校验，图鉴里不出现同名物品）；
  - `kind`：大类，取值只能是 `itemKinds`（物品 / 精灵果实 / 精灵蛋），空值归到「物品」；
  - `group`：分组，取值来自 `js/item-config.js` 的 `itemGroups`（咕噜球 / 精灵培养 / 种植与礼物 / 魔法与素材 / 货币与资源 / 其他道具），未知值兜底为「其他道具」；
  - `category`：细分类，显示在详情页描述上方（如「传说精灵挑战道具」），可空；
  - `icon` / `iconClass` / `color`：**有 `icon`（图片路径或外链）就优先显示图片**；没有则用 `iconClass`（Font Awesome 类名）+ `color`（十六进制）画图标；
  - `desc`：描述，一句话；
  - `obtain`：**字符串数组**，获取方式，一行一条；前台按 `fa-location-dot` 列表渲染，空数组显示「暂未记录」。
  - 后台图标上传存为 `items/{id}.png`，同样走压缩流程（尺寸取「上传压缩尺寸」）。

---

## 1.1 导航栏（全站唯一入口）

顶部导航栏已经抽成公共文件，**任何页面都不再自带导航 HTML**：

- 样式：`css/navbar.css`　结构 + 交互：`js/navbar.js`
- 每个前台页面 `<head>` 末尾只需两行：

```text
<link rel="stylesheet" href="css/navbar.css">
<script src="js/navbar.js" defer></script>
```

- 页面 `<body>` 内放一个占位容器，不要写任何导航内容：

```text
<div id="site-navbar"></div>
```

- **修改菜单**：只改 `js/navbar.js` 里的 `NAV` 数组（分组 + 子项 + `soon` 标记），全站所有页面同步生效。
- **修改样式**：只改 `css/navbar.css`。
- **当前页高亮**：`js/navbar.js` 的 `ACTIVE_MAP` 按文件名自动判断，新增页面时补一行映射即可。
- 注意：`navbar.js` 用 `defer` 注入，晚于各页 Vue 的 `mount('#app')`，所以不会被 Vue 覆盖；不要去掉 `defer`。



---

## 1.2 公共依赖约定

- **属性克制表**：只在 `js/type-chart.js` 维护一份（全局 `typeChart` + `getTypeMultiplier` / `getComboMultiplier` / `buildDefenderCombos`），`calculator.html` 与 `coverage.html` 直接引用，禁止再复制一份。
- **属性颜色/图标**：只在 `js/type-config.js` 维护，禁止在页面里写死色值。
- **技能分类图标/颜色**：只在 `js/category-config.js` 维护（`categoryData` 数组 + `getCategoryIcon` / `getCategoryColor`，图标用 Font Awesome，无需图片资源），前台 `skills.html` 与后台 `admin-skills.html` 都引用它，禁止在页面里写死分类图标或色值。
- **技能标签**：内置库在 `js/tag-config.js` 的 `BUILTIN_TAG_DATA`，完整可变库在 `localStorage['vowmon_tags_library']`（由后台技能管理的标签选择器维护）。`getTagLibrary()` / `saveTagLibrary()` / `makeCustomTag()` 负责读写，`getTagInfo` / `getTagIcon` / `getTagColor` 实时查询并支持未知标签的 hash 兜底。图标用 Font Awesome，无需图片资源。
- **弹窗组件**：后台五个页面（`admin/index.html`、`admin-skills.html`、`admin-traits.html`、`admin-items.html`、`admin-images.html`）都必须同时引入 `css/admin.css` 和 `css/common-ui.css`，否则弹窗、表单、选择器会没有样式。
- **自定义弹窗（替代系统 alert / confirm）**：统一由 `js/dialog.js` + `css/dialog.css` 提供（全局 `window.VowmonDialog`，样式类名前缀 `vdlg-`）。删除确认、校验提示、同步结果全部走它，**禁止再用系统 `alert()` / `confirm()` / `prompt()`**。
|  |  |
| --- | --- |
  - `VowmonDialog.confirm(消息, 选项)` → `Promise<boolean>`，`VowmonDialog.alert(消息, 选项)` → `Promise`，`VowmonDialog.prompt(消息, 选项)` → `Promise<string|null>`。
|  |  |  |
| --- | --- | --- |
  - `VowmonDialog.toast(消息, 'success' | 'warning' | 'danger')` 是右下角轻提示，用于「已保存 / 已删除 / 已同步」这类不需要用户确认的结果。
  - 选项：`type`（`info` / `success` / `warning` / `danger`）、`title`、`okText`、`cancelText`、`detail`（长错误信息，等宽小字块）、`html`（消息里要用 `<strong>` 时必须开，变量用 `VowmonDialog.esc()` 转义）、`duration`（仅 toast）。
  - 破坏性操作固定用 `type: 'danger'`：图标变红、Tab 焦点默认落在「取消」上防手滑。旧代码里带 ✅ / ❌ / ⚠️ 前缀的消息会被自动识别类型并去掉 emoji。
  - 它不复用 `.modal-overlay`，遮罩与键盘（Esc 取消 / Enter 确认）逻辑自管，因此 Esc 关弹窗时不会把后面的表单弹窗一起关掉；同时遵循 `vowmon_anim_on` 开关。
- **表格列宽**：`admin-items.html` 的物品表是 `table-layout: fixed`，`width` 对 `th` / `td` 按 border-box 计算（含左右各 16px 内边距）。列宽给小了，`text-overflow: ellipsis` 会把内容裁成「…」——典型现象是图标列显示「星…」、操作列按钮只剩「…」。图标列 78px（42px 图标框 + 内边距）、操作列 176px 并加 `.col-actions` 放开裁切，改列宽时按这个算。
- **后台搜索框**：图片管理工具栏统一用 `.search-field`（放大镜图标 + 内嵌清空按钮，清空按钮 `v-if` 只在有内容时出现）与 `.filter-select`（`appearance: none` + SVG 箭头），两者都是 40px 高 / 11px 圆角。不要再退回 `input-with-btn` + 独立 `btn` 的写法，也不要用默认 `<select>`。
- **物品大类 / 分组**：只在 `js/item-config.js` 维护（`itemKinds` + `itemGroups` + `normalizeItemKind` / `getItemGroupIcon` / `getItemGroupColor`）。前台 `items.html` 的 Tab 与筛选胶囊、后台 `admin-items.html` 的下拉都引用它，禁止在页面里写死分组名或配色；数据里没用到的分组不会显示。
- **图片上传**：所有「选本地文件 → 传到图片仓库」的入口都必须先过 `js/image-utils.js` 的 `ImageUtils.compressToPng(file, size)`，不要直接读 `FileReader` 原图上传。它负责等比缩放、输出 PNG、返回 `{ base64, blob, bytes, canvasSize }`；尺寸上限取 `localStorage['vowmon_sync_config'].imgSize`（缺省 512）。引入顺序：`github-api.js` → `image-utils.js` → `common-ui.js` → 页面脚本。
- **图片命名**：仓库里的精灵图只按编号命名——主图 `sprites/{编号}.png`，异色 `sprites/{编号}_s.png` / `_s2` / `_s3`；物品图标存 `items/{id}.png`。禁止再用原文件名或原后缀（jpg/webp 会与压缩后的 PNG 不一致）。
- **主图 / 异色图要分清**：图片管理页的「设为精灵图」和「上传图片」弹窗里都有「存到哪个位置」开关——`主图（替换原图）` 写 `pet.image`，`异色图（追加）` 写 `pet.shiny[]`（数组，不占编号）。文件名带 `_s` / `_s2` 的图会**自动预选「异色图」**，避免一按就把主图覆盖掉。判断函数是 `js/admin-images.js` 的 `looksShiny(path)`。
- **图片仓库列举**：任何「列出仓库里有哪些图」的地方都必须走 `GitHubSync.listDirectory()`，不要自己写 `fetch` 打 Contents API —— 它内部已经处理了 1000 条静默截断（超限自动切 Git Trees API，见 [§3.1](#31-图片仓库的-1000-条上限)）。
- **后台图片列表分页**：`admin-images.html` 的两个网格必须渲染 `paginatedRepoImages` / `paginatedPetRows`，不能直接用 `filteredRepoImages` / `filteredPetRows` 全量铺（上千张图会同时请求上千个缩略图）。每页 `PAGE_SIZE = 60`。
- **后台属性选择**：精灵 / 技能 / 特性三页统一用胶囊款式——表格内 `.type-pill`，表单内 `.type-pill-option`，胶囊内容为「属性图标 + 属性名称」，颜色取自 `type-config.js`。不要再退回纯文本或旧复选框网格。
- **技能分类**：只有「物理 / 特殊 / 变化」三类，取值统一来自 `js/category-config.js` 的 `categoryNames`（前后台都引用，`admin-skills.js` 的 `SKILL_CATEGORIES` 即指向它）。旧值映射表 `CATEGORY_ALIAS` 不要删（用于兼容历史数据）。
- **后台「显示列」状态**：三个管理页（精灵 / 技能 / 特性）的列显隐分别存在 `localStorage['vowmon_pets_visible_cols']` / `['vowmon_skills_visible_cols']` / `['vowmon_traits_visible_cols']`，值为列 key 的字符串数组。勾选即刻写盘、刷新保持；要恢复默认就清掉这个键（精灵默认显示头像/编号/名称/属性/属性图标/阶数/形态，技能与特性默认全显）。
- **显示列面板的收起判断**：document 上的点击监听必须用 `e.target.closest('.col-settings-wrap')` 判断「点在面板内还是外」，不能无条件 `showColSettings = false`。后者会把面板里勾选复选框的点击也当成外部点击，面板瞬间收起，复选框的默认切换被打断，表现为「要点好几次才生效」。技能页的监听是捕获阶段（为了穿透弹窗的 `@click.stop`），更要自己判断，因为捕获阶段先于目标元素的 `@click.stop` 执行。
- **移动端适配**：所有页面都必须最后引入 `css/responsive.css`（放 `</head>` 前），且 viewport 带 `viewport-fit=cover`。适配断点 900 / 640 / 380px，不要在各页内联样式里另写移动端规则。
- **图标/字体**：Font Awesome 6.4 与 Inter 变量字体走 jsDelivr CDN，各页 `<head>` 自行引入。
  - **字体栈**：`'Inter Variable', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'HarmonyOS Sans SC', 'MiSans', 'Source Han Sans SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif`，写在 `css/style.css` / `css/admin.css` / `css/navbar.css` 的 `body` 里（部分页面另有内联 `body` 规则，改字体时三处都要同步）。
  - **数字**用 `.font-num`（`font-variant-numeric: tabular-nums`），表格里的能力值、编号因此能对齐成一列。
  - **不要**再引入 Google Fonts 的 Nunito：国内经常被墙，而且字形偏圆，和现在的风格不搭。
  - 中文**不要**用 Noto Sans SC 网页字体：fontsource 的中文子集每个约 1MB，一页文字要拉好几个，太重；中文交给系统字体（HarmonyOS / MiSans / 思源黑体 / 苹方 / 微软雅黑）。
- **动效开关怎么生效**：唯一开关是 `localStorage['vowmon_anim_on']`（`'false'` = 关）。
  - 前台由 `js/navbar.js` 初始化时给 `body` 加 `.no-anim`，并由 `css/responsive.css` / 各页内联规则把所有 `transition` / `animation` 置为 `none !important`（含 `body` 自身）。
  - **后台页不加载 `navbar.js`**，改由 `js/common-ui.js` 读取并应用 `.no-anim`。
  - 切换开关时统一 `window.dispatchEvent(new CustomEvent('vowmon:anim-changed', { detail: { on } }))` 广播，页内开关（图鉴 / 列表页）与导航栏按钮互相监听；同时监听 `storage` 事件做跨标签页同步。**不要再各写一套私有状态**——曾经因为不广播，关掉动效后图鉴的异色轮播定时器还在跑。
  - 关掉时还必须主动清掉 JS 定时器（`vowdex.html` 的异色轮播 `stopShiny()`），CSS 规则管不了 `setInterval`。
- **后台加载策略**：后台页调 `VowmonData.ready([...])` **不要传 `fresh: true`**——本机有镜像就秒开（后台静默对账），要拉仓库最新数据点顶栏「从仓库拉取」。`data-loader.js` 在「非 fresh 且请求的所有 key 都有本机镜像」时会跳过「正在加载数据…」遮罩，避免闪屏。`localStorage` 草稿**优先于**远端，别改成远端优先（会丢未同步修改）。

---

## 2. 数据与同步机制（站点与数据解耦）

**三个仓库各管一件事**：

| 仓库 | 放什么 | 谁读它 |
|---|---|---|
| `vowmon` | 站点本体（HTML / CSS / JS），**不含任何数据** | GitHub Pages、Cloudflare Pages |
| `vowmon_data` | 唯一数据源，5 个 JSON | 前台运行时拉取、后台读写 |
| `vowmon_imgs` | 按编号命名的 PNG | 前台通过 `/img/*` 反代读取 |

**前台怎么读**：页面里没有 `<script src="data/xxx.js">` 了，统一走 `js/data-loader.js`：

```text
VowmonData.ready(['pets']).then(function () { createApp({...}).mount('#app'); });
```

加载器依次尝试 `dataCdnBase`（默认本站 `/data/*` 反代）→ jsDelivr → raw.githubusercontent，任何一个成功就把 JSON 里的字段赋给对应全局变量，然后才挂载 Vue；全都失败会显示带「重新加载」按钮的错误页，不会白屏。

### 2.1 本地优先 + 云端对账（后台改完，前台立刻变）

取数不是「只读云端」，而是**先信本地，再和云端比**：

```text
① 本机镜像 localStorage: vowmon_mirror_<key>
   ← 后台每次保存都会写这里（精灵/技能/特性/物品）
② 云端数据仓库（三个源依次兜底）
③ 两边比对：
   - 一样 → 什么都不做
   - 不一样 + 本地没有未同步修改 → 用云端覆盖，页面自动刷新
   - 不一样 + 本地有未同步修改 → 保留本地，等你点「一键同步」
```

- **同一台电脑**：后台保存 → 写镜像 → `storage` 事件 → 前台标签页**不用刷新**就更新（实测有效）；跨标签页、跨页面（列表 / 图鉴 / 技能 / 物品）都跟着变。
- **换设备 / 访客**：没有本机镜像，走云端；`/data/*` 代理缓存 60 秒，所以后台同步后最多 1 分钟生效。
- 「未同步修改」标记：`vowmon_dirty_keys`。点「一键同步」成功后自动清掉；点「从仓库拉取」也会用远端覆盖本机并清掉。
- 想让页面在数据变化时自己更新，用 `VowmonData.onChange('pets', (data) => { ... })`；`js/vowmon-utils.js` 提供 `VowmonUtils.normalizeAll()`，补齐缺字段的精灵，避免一条脏数据把整页渲染搞崩。

**后台怎么读写**：

- 编辑 → 写 `localStorage` 草稿 → 点「一键同步」把 JSON 推到数据仓库根目录；
- 打开后台时先按 `?fresh` 拉远端 JSON，本机有草稿则优先用草稿（避免丢未同步的改动）；
- 想用远端覆盖本机，点顶栏的「从仓库拉取」（会弹确认框）。

**JSON 结构**（每份是一个对象，字段名与全局变量一一对应）：

| 文件 | 字段 → 全局变量 |
|---|---|
| `vow-data.json` | `pets` → `allPetsData` |
| `skills-data.json` | `skills` → `allSkillsData` |
| `traits-data.json` | `traits` → `allTraitsData` |
| `items-data.json` | `kinds` → `itemKindsData`、`groups` → `itemGroupsData`、`categories` → `itemCategoriesData`、`items` → `allItemsData` |
| `natures-data.json` | `natures` → `allNaturesData`、`stats` → `natureStats` |

**缓存**：`/data/*` 代理缓存 60 秒，后台同步完一分钟内前台可见；jsDelivr 兜底源约 12 小时。

**Token 安全**：后台填的 Fine-grained Token 只存在浏览器 `localStorage`，不会上传到任何仓库。

**多数据仓库**：`dataRepos` 支持逗号分隔多个仓库，同步时逐个推送；但**前台只读 `dataCdnBase` 指向的那一个**，多仓只作备份用途，别指望前台自动合并。
---

## 3. 规模上限与性能（千只精灵）

站点按「一千只以上精灵」的规模做过压测和加固，以下是需要知道的几条硬约束。

### 3.1 图片仓库的 1000 条上限

GitHub **Contents API 对单个目录最多只返回 1000 个条目**，超出部分会被**静默截断**：不报错，只是后面的文件在列表里凭空消失。图片仓库很容易破千 —— 500 只精灵就是 500 张主图 + 500 张异色图 = 1000 张。

`js/github-api.js` 的 `listDirectory()` 已经处理掉这件事：

- 正常情况（< 1000 条）行为不变，仍然只发 1 个请求；
- 一旦发现返回满 1000 条，自动改用 **Git Trees API**（`/git/trees/{默认分支}?recursive=1`）取全量，再按目录前缀过滤出「直接子文件」（不含子目录里的文件、不含目录项）；
- 返回结构与 Contents API 完全一致（`{ name, path, sha, size, type }`），`sha` 就是同一个 blob sha，可以直接拿去 `DELETE /contents/...` 删文件；
- Trees API 单次最多返回 10 万个条目，几千张图毫无压力。

需要额外 2 个请求（取默认分支 + 取文件树），只在破千时发生。

### 3.2 要不要开 imgs1 / imgs2 两个仓库？

**不需要，也不建议用拆仓库来回避这个问题。**

- 1000 条是**每个目录**的限制，不是每个仓库。拆成两个仓库确实能把上限抬到 2000 张，但总数再涨（比如 1500 只精灵 = 3000 张图）时每个仓库又会各破千，问题原样回来，只是变成「两个仓库各丢一半」，更难排查。
- 现在的 Trees API 兜底本身**没有上限**，一个仓库放几千张图完全没问题。
- 拆仓库的真实代价：图片要在两个仓库间手工分配、CDN 路径出现两套、备份和迁移都更麻烦。

多仓支持（`imgRepos` 逗号分隔）保留着，正确用途是**按内容分类**（例如 `vowmon_imgs` 放精灵、`vowmon_items` 放物品），不是用来绕开数量上限。

### 3.3 图片管理页分页

`admin-images.html` 的两个网格都只渲染当前页（`PAGE_SIZE = 60`）：

- 上千张图时不会一次生成上千个 `<img>` 去轰 CDN（那会卡死页面，还可能被 jsDelivr 限流）；
- 搜索框或筛选条件一变就自动回到第 1 页；重新扫描后总页数变少时页码自动纠正，不会停在空页；
- 底部有「首页 / 上一页 / 页码 / 下一页 / 末页」，只有超过一页时才出现。

### 3.4 图片与精灵的匹配索引（O(n²) → O(1)）

后台要判断「每张图被哪些精灵使用」。原来的写法是 `精灵数 × 图片数` 的双重遍历 —— 1000 只精灵（含异色约 2000 张图）要跑几百万次字符串比较，主线程会卡好几秒。

现在 `admin-images.js` 用 computed 预建两张 Map（按完整路径 `byPath`、按文件名 `byName`），单次查找 O(1)；`getPetUrl()` 也改成直接查索引，不再去 `petRows` 里线性 `find`（那是模板里每行调多次的 O(n²)）。

### 3.5 实测数据（1000 条精灵 / 693KB 数据文件）

| 项目 | 耗时 |
|---|---|
| 搜索过滤一次（全表 1000 条） | 0.04 ms |
| 搜索 + 系别 + 阶数组合筛选 | 0.07 ms |
| 全表排序 | 0.04 ms |
| 图鉴渲染 30 张卡片（每页） | 3.7 ms |
| 精灵列表渲染 10 行（每页） | 1.4 ms |
| 渲染 100 张卡片 | 12.1 ms |
| 渲染 1000 张卡片（不分页的极端情况） | 66 ms |
| 后台保存：序列化 1000 条（677KB） | 3.86 ms |
| 后台读取：反序列化 | 2.75 ms |

结论：**数据层和渲染层都不是瓶颈**，现有分页（图鉴 30 / 列表 10 / 后台 15）足够撑到几千只。真正的成本只有数据文件体积 —— 1000 条 693KB，gzip 后约 100–150KB，4G 下一两秒。

### 3.6 数据量再往上走时先看这里

- **图片**：单页 30 张卡片，每张最多 2 个 `<img>`（主图 + 异色），都带 `loading="lazy"`。若以后单页图片明显变多，先考虑降 `pageSize` 而不是加虚拟滚动。
- **后台保存**：每次改动都会 `JSON.stringify` 全量写入 `localStorage`（1000 条约 3.9ms）。`localStorage` 单域上限约 5MB，按当前单条 ~677 字节算，可存约 7000 条；接近上限时应改为分片存储或直接把数据文件作为唯一数据源。
- **一键同步**：推送的是 JSON 文本（1000 条约 677KB），GitHub Contents API 单文件上限远高于此，暂时无需改用 Git Data API。

### 3.7 流畅度红线（踩过的坑）

后台是**单页单组件**结构，一个 `ref` 变动整页重渲染，所以这几条是硬约定：

1. **禁用 `v-memo`**。全站 Vue 是 CDN 全量包 + HTML 内联模板（运行时编译），`v-memo` 在这种场景下首次渲染就抛 `TypeError: Cannot read properties of undefined (reading 'memo')`，页面被 `v-cloak` 藏住 → 白屏。要隔离重渲染就**抽子组件**（模板字符串写在 JS 里、`app.component('xxx', {...})` 注册、`app.mount('#app')` 与 `createApp` 拆开）。整个"特性表格"现在就是子组件 `trait-table`：props（`traits` / `visibleCols` / 回调）不变时子组件直接跳过更新，效果等同 `v-memo` 且是官方写法。
   - 表格类子组件**直接输出完整 `<table>`**；不要用 `is="vue:xxx"` 往 `<table>` 里塞组件——HTML 解析器会把不认识的标签提升到 table 外面，渲染出来结构错乱。
2. **禁止在全屏遮罩上用 `backdrop-filter`**。`.modal-overlay` 曾经带 `blur(2px)`，遮罩铺满屏幕，里面列表每滚一帧都要重算整屏模糊，GPU 直接拉满 → 上下滑动明显掉帧。现在两处遮罩（`.modal-overlay`、`dialog.css` 的 `.vdlg-mask`）都改为默认无模糊，模糊只在 `body:not(.no-anim)` 时启用（即牺牲一点观感换流畅）。
3. **滚动容器**：`.selection-list` 这类弹窗内长列表要加 `overscroll-behavior: contain`（滚到底不把滚动传给背后页面）+ `will-change: scroll-position`（提为独立合成层）。列表项不要挂 `background` 过渡——滚动时鼠标扫过每一项都会触发重绘。
4. **表格 hover 只改 `td` 背景，不改 `tr`**：`td` 自带 `background: #fff`，hover 写成 `tbody tr:hover td { background: ... }`。给 `tr` 设背景会让浏览器重绘整行 + 透出 wrapper 白底，在 `border-radius + overflow: hidden` 的容器里表现为**表格闪一下白**。**表头也不要用 `transition: background`**：深色表头做过场会重算整张表的绘制层，鼠标扫过表头就是「泛白 / 表格变白」的直接原因；表头 hover 只改 `color` 或用下划线。容器加 `isolation: isolate` 可以把重绘限制在表格内部。
5. **高频判断用 Set**：勾选状态这类"每行每帧都要问一次"的逻辑，别在模板里对数组做 `includes`，先 `computed` 出一个 `Set`，模板里 `set.has(name)`。
6. **搜索框加防抖**：搜索框绑一个普通 `ref`，`watch` 180ms 后再写入真正参与过滤的 `ref`（`pokemonSearchInput` → `pokemonSearchQuery`），否则每敲一个字全量过滤一遍。
7. **弹窗入场动效只动 `opacity` / `transform`**（`common-ui.css`），这两个属性走 GPU 合成层，不触发重排重绘。全部 gated 在 `body:not(.no-anim)` 下，关掉动效就彻底不动。
8. **验证方式**：改完后台代码必须在浏览器里实开一次（`node --check` 只能证明语法不炸），白屏类问题只看控制台第一条红字最快。**每次改动 css/js 都要同步升 `?v=YYYYMMDD[字母]`**，否则浏览器缓存旧文件 + 新 HTML 会造成难以复现的"本地坏、线上好"。

## 4. 部署（GitHub Pages + Cloudflare Pages）

站点是纯静态的，同一份代码同时发布到两个地方，随便哪个能打开都能用。

### 4.1 线上地址

| 平台 | 地址 | 发布方式 |
|---|---|---|
| Cloudflare Pages（**主站**） | https://vowmon.keeptrue.ren/ | GitHub Actions（`.github/workflows/deploy-cloudflare.yml`）或本地 `wrangler pages deploy`；`vowmon.keeptrue.ren` 是新网 DNS 上的 CNAME → `vowmon.pages.dev` |
| Cloudflare Pages（裸地址） | https://vowmon.pages.dev/ | 同上，和上面是同一个项目 |
| GitHub Pages | https://keeptrue.ren/vowmon/（裸地址 `luo029.github.io/vowmon/` 会 301 过来） | 仓库 Settings → Pages → Deploy from a branch：`main` / `(root)`，**push 即发布** |

前两个是同一个 Pages 项目、同一份构建产物，只是域名不同。

**资源基址不绑自定义域名**：`js/site-config.js` 里的 `imgCdnBase` / `dataCdnBase` 用的是 `https://vowmon.pages.dev/...` 这种固定裸域名。自定义域名只是一层访问入口——域名到期、换域名、临时解绑，都不会让全站数据和图片失效。想改基址有两个办法：

1. 改仓库里的 `js/site-config.js`（对**所有访客**生效，需要提交 + 部署）；
2. 后台「精灵管理 → 同步配置 → 数据仓库 / 图片仓库」里的 **数据公开地址 / 图片公开地址**（只对**你自己这台浏览器**生效，存在 `vowmon_sync_config`，留空即用默认值，输入框右边的 ↺ 就是一键恢复默认）。调试换源时用这个，不用改代码。


可填的值举例：

| 用途 | 地址 |
|---|---|
| 走本站 CF 代理（默认，推荐） | `https://vowmon.pages.dev/data`、`https://vowmon.pages.dev/img` |
| jsDelivr 直连仓库 | `https://cdn.jsdelivr.net/gh/luo029/vowmon_data@main` |
| GitHub raw 直连仓库 | `https://raw.githubusercontent.com/luo029/vowmon_data/main` |

> 数据加载器自带三级回退：默认基址 → jsDelivr → raw.githubusercontent，前一个失败自动换下一个，所以基址写错一般也不至于白屏（只是会慢一点）。

> **绑定自定义域名必须做的一步**：在新网加完 CNAME 还不够，还要在 Cloudflare Pages 项目里把这个域名登记为 Custom domain（面板 Domains → Add，或 `POST /accounts/{id}/pages/projects/vowmon/domains` 带 `{"name":"vowmon.keeptrue.ren"}`）。只加 CNAME 不登记，访问会报 **Error 1001 / DNS resolution error（Please enable cookies）**——因为 CF 边缘没有这个主机名的配置，也没有对应证书，TLS 直接握手失败。登记后状态会走 `initializing → pending → active`，约 2 分钟签好 Google 证书即自动生效。

### 4.2 GitHub Pages

- 已经在仓库 Settings → Pages 里选好 `main` 分支根目录，不需要额外的构建步骤；
- 根目录的 `.nojekyll` 让 GitHub 跳过 Jekyll：不用等它跑一遍构建，也不会因为文件名下划线被过滤；
- 全部链接都是相对路径（`css/style.css` 而不是 `/css/style.css`），所以在 `luo029.github.io/vowmon/` 这种子路径下也能正常跳转；
- **不要**再给这个仓库加"用 Actions 发布 Pages"的工作流：PAT 需要 `pages=write` + `administration=write` 才能开启 Pages，而分支发布本身已经够了，多一条工作流只会多一堆失败记录。

### 4.3 图片加速：`/img/*` 反向代理

图片仓库 `vowmon_imgs` 里的原图不直接给浏览器访问，而是经本站 Cloudflare Pages Function 代理：

```text
浏览器  https://vowmon.pages.dev/img/sprites/001.png
   ↓  functions/img/[[path]].js
源站    https://raw.githubusercontent.com/luo029/vowmon_imgs/main/sprites/001.png
回退    https://cdn.jsdelivr.net/gh/luo029/vowmon_imgs@main/sprites/001.png
```

要点：

- **只在第一次回源**，之后由 CF 边缘节点直接返回（响应头 `CF-Cache-Status: HIT`），国内访问不再依赖 GitHub 的连通性；
- 缓存 **1 小时**。后台覆盖上传同名图片后，最迟 1 小时生效；想立刻看到新图，在图片地址后面加个 `?v=任意值` 即可破缓存（缓存键带 query）；
- 只代理图片后缀（png/jpg/webp/gif/svg/avif/bmp/ico），并且拦掉 `..` 路径，不会变成通用代理；
- `_routes.json` 把 Functions 的触发范围限制成 `/img/*`，其余静态文件不消耗函数调用额度（免费额度 10 万次/天）；
- 前台取值在 `js/site-config.js` 的 `imgCdnBase`。想换回 jsDelivr 直连，改成 `https://cdn.jsdelivr.net/gh/luo029/vowmon_imgs@main` 即可；后台「同步配置」里的 `imgCdnBase` 优先级更高，只影响你自己这台浏览器。

### 4.4 一键发布流程

```text
git add -A && git commit -m "..." && git push
```

- GitHub Pages：push 后 30~60 秒自动更新；
- Cloudflare Pages：仓库 Secret `CLOUDFLARE_API_TOKEN`（权限只要 Account → Cloudflare Pages: Edit）配合工作流自动部署，同样 1 分钟左右。

不想走 CI、想手动传一次：

```text
npx wrangler pages deploy . --project-name=vowmon --branch=main
```

前提是本机有 `CLOUDFLARE_API_TOKEN` 环境变量，或者先 `wrangler login`。

### 4.5 缓存策略（`_headers` + 函数头）

| 路径 | Cache-Control | 说明 |
|---|---|---|
| `/img/*` | `max-age=3600` | 由函数设置，图换了最多 1 小时后生效 |
| `/css/*`、`/js/*` | `max-age=1800` | 改版 30 分钟内全量生效 |
| `/data/*` | `max-age=60` | 后台一保存就能很快被访客看到 |
| `*.html` | 不显式设置 | 每次协商缓存，保证页面结构改动立刻生效 |

改样式/脚本后如果自己看不到变化，`Ctrl+F5` 强刷一次即可（访客最多等 30 分钟）。

### 4.6 出问题时先看这里

- **图 404**：先在浏览器直接打开 `https://raw.githubusercontent.com/luo029/vowmon_imgs/main/<路径>` 确认文件真的在仓库里；再试 `https://vowmon.pages.dev/img/<路径>`。都正常说明是数据里的路径写错了（少了 `sprites/` 之类）。
- **图不更新**：CF 缓存 1 小时，加 `?v=2` 破缓存，或等一小时。
- **Cloudflare 部署失败**：看 Actions 日志；最常见是 Secret 过期/被删（`CLOUDFLARE_API_TOKEN`），去 Cloudflare「我的个人资料 → API 令牌」重新建一个并更新 Secret。
- **GitHub Pages 404**：确认 Settings → Pages 里的分支还是 `main` / `(root)`，以及 `index.html` 在仓库根目录。
- **自建域名报 Error 1001（Please enable cookies）**：DNS 通了但 CF 不认这个主机名。查 `GET /accounts/{id}/pages/projects/vowmon/domains`，没有这条就补登记；有但 `status` 不是 `active` 就再等一两分钟。用 `curl -sS -o /dev/null https://<域名>/` 若报 `SEC_E_ILLEGAL_MESSAGE`/handshake failed，也是同一个原因（没有证书）。
