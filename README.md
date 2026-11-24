# Vowmon Wiki

Vowmon（契约精灵）的非官方设定 Wiki 与数据工具站。
纯静态站点，Vue 3 CDN 版驱动，GitHub Pages / Cloudflare Pages 托管。

---

## ⚠️ 核心开发规范 (给 AI 的备忘录)

1. **命名规范**：官方英文名 **Vowmon**，图鉴英文 **Vowdex**。**「精灵」的英文统一叫 Vowmon**（数据源即 `vow-data.js`，全局变量仍为 `allPetsData` 以兼容已保存数据）。禁止使用 Pokedex / Pokemon / pets 作为对外名称。
2. **代码输出格式**：所有生成的代码必须使用 ` ```text ` 代码块，**禁止使用高亮**。代码文件名写在代码块上方。严禁使用省略号。
3. **目录规范**：**按文件类型分文件夹**——`css/`、`js/`、`data/`，`.html` 页面留在根目录。禁止再新增 `assets/`、`pages/` 之类的分类层，禁止把文件直接丢回根目录。

4. **性能与动效**：全站默认开启过渡动画，但必须受 `localStorage.getItem('vowmon_anim_on')` 控制。当值为 `'false'` 时，不应有任何动画。
5. **属性统一**：所有属性的图标和颜色存放在 `js/type-config.js`，全局引用。

---

## 1. 目录结构

```text
vowmon/
├── index.html              # 首页
├── vowdex.html             # 精灵图鉴
├── list.html               # 精灵列表
├── skills.html             # 技能图鉴
├── traits.html             # 特性大全
├── natures.html            # 性格大全
├── items.html              # 物品图鉴（列表 + 详情）
├── calculator.html         # 属性克制计算器
├── coverage.html           # 打击面计算器
├── admin.html              # 后台 - 精灵管理
├── admin-skills.html       # 后台 - 技能管理
├── admin-traits.html       # 后台 - 特性管理
├── admin-items.html        # 后台 - 物品管理
├── admin-images.html       # 后台 - 图片管理
├── README.md               # 本文件
│
├── css/                    # 所有样式
│   ├── style.css           # 前台统一样式
│   ├── navbar.css          # 全站导航栏样式（唯一来源）
│   ├── common-ui.css       # 通用组件样式（弹窗、表单、选择器）
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
│   ├── github-api.js       # GitHub API 封装
│   ├── image-utils.js      # 图片上传前处理：压缩 / 等比缩放 / 统一输出 PNG
│   ├── admin.js            # 精灵后台逻辑
│   ├── admin-skills.js     # 技能后台逻辑
│   ├── admin-traits.js     # 特性后台逻辑
│   ├── admin-items.js      # 物品后台逻辑
│   └── admin-images.js     # 图片管理逻辑
│
└── data/                   # 所有数据（可由后台一键同步覆盖）
    ├── vow-data.js         # 精灵(Vowmon)数据
    ├── skills-data.js      # 技能数据
    ├── traits-data.js      # 特性数据
    ├── items-data.js       # 物品数据
    └── natures-data.js     # 性格数据（宝可梦 25 性格 + 能力配色，只读）
```

**引用路径举例**（页面都在根目录，所以统一带文件夹前缀）：

```text
<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="css/navbar.css">
<script src="js/navbar.js" defer></script>
<script src="js/type-config.js"></script>
<script src="js/category-config.js"></script>
<script src="js/tag-config.js"></script>
<script src="data/vow-data.js"></script>
```

> 新增页面时，放根目录；新增的 css 放 `css/`，js 放 `js/`，数据放 `data/`，并在页面里按上面的前缀引用。

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
- **特性大全 traits.html**：表格展示全部特性（ abilities ）。支持搜索与按关联属性筛选，并列出每个特性「拥有该特性的精灵」。
- **性格大全 natures.html**（布局参照洛克王国 wiki，数据采用宝可梦 25 性格，仅保留能力修正部分）：
  - 性格影响能力值：一项 **+10%**、另一项 **-10%**；另有 5 种中性性格（勤奋 / 坦率 / 害羞 / 浮躁 / 认真）无任何修正。
  - **性格速查表**：横轴「降低的能力」× 纵轴「提高的能力」的 5×5 矩阵，交叉格显示对应性格，点击可定位到卡片；下方列出 5 种中性性格。
  - **性格卡片**：每张显示中文 / 日文 / 英文名、能力修正（如「攻击 +10% / 特攻 -10%」）。
  - 筛选：按「提高的能力 / 降低的能力」多选，以及按名称（中 / 日 / 英）搜索。
  - 数据唯一来源是 `data/natures-data.js`（`allNaturesData` + `natureStats` 能力配色），为只读数据，不由后台同步覆盖。
- **物品图鉴 items.html**：物品的浏览与详情页，列表 / 详情是同一个页面（`items.html?id=i001` 直达某件物品，前进后退可用）：
  - **列表**：顶部大标题 + 「已筛 / 当前大类总数」计数；搜索（名称、描述、获取方式、分组都会命中）；分组胶囊筛选（只显示数据里实际有物品的分组，带数量角标）；`默认 / 名称 / 分组` 三种排序。
  - **大类 Tab**：数据里出现两个及以上的「物品 / 精灵果实 / 精灵蛋」时才显示，只有一个大类时自动隐藏。
  - **卡片**：左侧是图标（有图片用图片，没有则用图标字体 + 主题色），右侧是名称与两行描述，整卡可点。
  - **详情**：面包屑（← 物品图鉴 / 分组）→ 大标题 → 详情卡（左大图标，右侧从上到下为「细分类 → 描述 → 分割线 → 获取方式（可多条，带定位点小图标）」）→ **继续看看**（同分组的其它物品优先，最多 4 条）。
- **属性克制计算器 calculator.html**：查属性相克的工具。分「防守面」（某属性的精灵怕什么、抗什么）和「进攻面」（某属性的技能打谁翻倍、打谁减半），底部可展开 **18×18 完整克制表**。
- **打击面计算器 coverage.html**：组队/配招研究工具。最多选 5 个技能属性，统计这套组合能覆盖 18 单系 + 153 双系共 **171 种属性组合**中的多少种，并分档报告（4 倍克制 / 2 倍克制 / 免疫 / 双重抵抗 / 抵抗）。

### 1.05.2 后台页面（维护数据用的）

- **admin.html**：精灵管理 + 同步配置（同一页两个 Tab）。增删改精灵、配置「显示列」、一键同步数据到 GitHub。
  - **上传即压缩 + 自动命名**：本地选图后先经 `js/image-utils.js` 处理——等比缩放（最长边不超过「同步配置 → 上传压缩尺寸」，默认 512，可选 256 / 512 / 768 / 1024），统一转成 **PNG**（保留透明底），小图不放大、不裁切（非正方形补透明边）。文件名强制按编号生成：主图 `sprites/{编号}.png`，异色 `sprites/{编号}_s.png`、`_s2`、`_s3`…；原文件名与后缀一概忽略。保存时若改过编号，会把本次上传的图按新编号重传并删掉旧文件（仅限本次会话上传过的图，手填路径/刷新过页面则保持原路径）。
  - **异色图片**：表单里「精灵图片」下方多一个「异色图片」区块，可**多张**维护。支持一次选多个文件上传（串行上传），也支持手填外链 / 路径后点「添加」；缩略图按 #1、#2… 排序，可单张移除。异色图存在精灵对象的 `shiny` 数组里，**不占编号、不生成独立条目**，后台列表也不额外显示。
- **admin-skills.html**：技能管理。增删改技能（属性单选胶囊、分类下拉、标签选择器）、配置「显示列」（含「标签」列）、一键同步。
  - **标签选择器**：不再平铺全部标签，而是「已选胶囊 + 搜索框 + 候选下拉」。输入关键字搜索标签并点选；搜不到时可按回车 / 点「新建」直接创建自定义标签；每个候选标签右侧的垃圾桶图标可删除该标签（会同时从所有技能中移除）。标签库变动会即时持久化。
- **admin-traits.html**：特性管理。增删改特性、配置「显示列」、一键同步。
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
- **特性（ability / trait）**：每只精灵拥有一个特性；特性数据里用 `pokemons` 数组反查「哪些精灵拥有它」。精灵的 `ability` + `abilityEffect` 与特性库是两套字段，改文案时要同步。
- **六维能力（stats）**：`hp`（HP）、`atk`（攻击）、`def`（防御）、`spAtk`（特攻）、`spDef`（特防）、`spd`（速度）。
- **异色图（shiny）**：精灵对象上的**字符串数组**，存该精灵的异色立绘路径 / 外链，按顺序即展示顺序（`shiny[0]` 是第一张）。没有就填 `[]`（旧数据没有这个字段也兼容，前端按空处理）。约定：
  - **不占编号**：异色不是独立条目，不新增 `id`、不进图鉴计数、列表也不多一行；
  - 后台上传的命名规则是 `sprites/{编号}_s.png`（如 `401_s.png`），第二张起依次 `_s2`、`_s3`；旧数据里的 `_shiny{n}` 依然能识别，取序号时会跳过已被占用的；
  - 上传的图统一压缩为 PNG，尺寸受「同步配置 → 上传压缩尺寸」控制；
  - 只有图鉴卡片用得到它——有异色的卡片悬停显示异色图，没有的保持原来的放大动效。
- **物品（item）**：`data/items-data.js` 的 `allItemsData` 数组，字段如下：
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

- **修改菜单**：只改 `js/navbar.js` 里的 `NAV` 数组（分组 + 子项 + `soon` 标记），全站 7 个页面同步生效。
- **修改样式**：只改 `css/navbar.css`。
- **当前页高亮**：`js/navbar.js` 的 `ACTIVE_MAP` 按文件名自动判断，新增页面时补一行映射即可。
- 注意：`navbar.js` 用 `defer` 注入，晚于各页 Vue 的 `mount('#app')`，所以不会被 Vue 覆盖；不要去掉 `defer`。

---

## 1.2 公共依赖约定

- **属性克制表**：只在 `js/type-chart.js` 维护一份（全局 `typeChart` + `getTypeMultiplier` / `getComboMultiplier` / `buildDefenderCombos`），`calculator.html` 与 `coverage.html` 直接引用，禁止再复制一份。
- **属性颜色/图标**：只在 `js/type-config.js` 维护，禁止在页面里写死色值。
- **技能分类图标/颜色**：只在 `js/category-config.js` 维护（`categoryData` 数组 + `getCategoryIcon` / `getCategoryColor`，图标用 Font Awesome，无需图片资源），前台 `skills.html` 与后台 `admin-skills.html` 都引用它，禁止在页面里写死分类图标或色值。
- **技能标签**：内置库在 `js/tag-config.js` 的 `BUILTIN_TAG_DATA`，完整可变库在 `localStorage['vowmon_tags_library']`（由后台技能管理的标签选择器维护）。`getTagLibrary()` / `saveTagLibrary()` / `makeCustomTag()` 负责读写，`getTagInfo` / `getTagIcon` / `getTagColor` 实时查询并支持未知标签的 hash 兜底。图标用 Font Awesome，无需图片资源。
- **弹窗组件**：后台五个页面（`admin.html`、`admin-skills.html`、`admin-traits.html`、`admin-items.html`、`admin-images.html`）都必须同时引入 `css/admin.css` 和 `css/common-ui.css`，否则弹窗、表单、选择器会没有样式。
- **物品大类 / 分组**：只在 `js/item-config.js` 维护（`itemKinds` + `itemGroups` + `normalizeItemKind` / `getItemGroupIcon` / `getItemGroupColor`）。前台 `items.html` 的 Tab 与筛选胶囊、后台 `admin-items.html` 的下拉都引用它，禁止在页面里写死分组名或配色；数据里没用到的分组不会显示。
- **图片上传**：所有「选本地文件 → 传到图片仓库」的入口都必须先过 `js/image-utils.js` 的 `ImageUtils.compressToPng(file, size)`，不要直接读 `FileReader` 原图上传。它负责等比缩放、输出 PNG、返回 `{ base64, blob, bytes, canvasSize }`；尺寸上限取 `localStorage['vowmon_sync_config'].imgSize`（缺省 512）。引入顺序：`github-api.js` → `image-utils.js` → `common-ui.js` → 页面脚本。
- **图片命名**：仓库里的精灵图只按编号命名——主图 `sprites/{编号}.png`，异色 `sprites/{编号}_s.png` / `_s2` / `_s3`；物品图标存 `items/{id}.png`。禁止再用原文件名或原后缀（jpg/webp 会与压缩后的 PNG 不一致）。
- **后台属性选择**：精灵 / 技能 / 特性三页统一用胶囊款式——表格内 `.type-pill`，表单内 `.type-pill-option`，胶囊内容为「属性图标 + 属性名称」，颜色取自 `type-config.js`。不要再退回纯文本或旧复选框网格。
- **技能分类**：只有「物理 / 特殊 / 变化」三类，取值统一来自 `js/category-config.js` 的 `categoryNames`（前后台都引用，`admin-skills.js` 的 `SKILL_CATEGORIES` 即指向它）。旧值映射表 `CATEGORY_ALIAS` 不要删（用于兼容历史数据）。
- **后台「显示列」状态**：三个管理页（精灵 / 技能 / 特性）的列显隐分别存在 `localStorage['vowmon_pets_visible_cols']` / `['vowmon_skills_visible_cols']` / `['vowmon_traits_visible_cols']`，值为列 key 的字符串数组。勾选即刻写盘、刷新保持；要恢复默认就清掉这个键（精灵默认显示头像/编号/名称/属性/属性图标/阶数/形态，技能与特性默认全显）。
- **显示列面板的收起判断**：document 上的点击监听必须用 `e.target.closest('.col-settings-wrap')` 判断「点在面板内还是外」，不能无条件 `showColSettings = false`。后者会把面板里勾选复选框的点击也当成外部点击，面板瞬间收起，复选框的默认切换被打断，表现为「要点好几次才生效」。技能页的监听是捕获阶段（为了穿透弹窗的 `@click.stop`），更要自己判断，因为捕获阶段先于目标元素的 `@click.stop` 执行。
- **移动端适配**：所有页面都必须最后引入 `css/responsive.css`（放 `</head>` 前），且 viewport 带 `viewport-fit=cover`。适配断点 900 / 640 / 380px，不要在各页内联样式里另写移动端规则。
- **图标/字体**：Font Awesome 6.4 与 Google Fonts Nunito 走 CDN，各页 `<head>` 自行引入。

---

## 2. 数据与同步机制

- **Token 安全**：你在后台配置的 Fine-grained Token 仅保存在浏览器 `localStorage`，绝不上传。
- **多仓支持**：后台配置支持逗号分隔多个数据仓库（如 `vowmon_data_1, vowmon_data_2`），同步时将自动逐个推送。
- **一键同步**：在后台修改数据后，点击右上角“一键同步”即可将最新的 JS 数据文件推送到 GitHub 数据仓库根目录（文件名为 `vow-data.js` / `skills-data.js` / `traits-data.js` / `items-data.js`），前台刷新即可拉取。
- **仓库内路径**：数据文件在站点里的位置是 `data/xxx-data.js`，推送到 GitHub 数据仓库时放在该仓库根目录，两者互不影响。