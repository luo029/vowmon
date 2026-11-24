/* ==========================================================================
   Vowmon Wiki 物品配置 —— 类型 / 分组 / 细分类 的唯一来源
   --------------------------------------------------------------------------
   前台 items.html 与后台 admin-items.html 都引用本文件，禁止在页面里写死名称或配色。

   · itemKinds     物品大类（图鉴顶部 Tab）
   · itemGroups    物品分组（图鉴筛选胶囊），带图标与配色
   · itemCategories 细分类建议列表（详情页描述上方的金色小字）

   自定义列表怎么落地：
     后台增删改 -> 写入 localStorage['vowmon_item_*']
                 -> 点「一键同步」时写进 data/items-data.js
                 -> 文件里的 itemKindsData / itemGroupsData / itemCategoriesData 覆盖内置默认
   因此 data/items-data.js 必须在本文件之前引入，否则读不到覆盖列表。

   规则：数据里出现的分组，一定能在后台下拉里选到；数据里没用到的分组，
   前台筛选栏不会显示（沿用技能标签「只显示用到的」口径）。
   ========================================================================== */

/* ------------------------------------------------------------ 内置默认 */
const ITEM_BUILTIN_KINDS = ['物品', '精灵果实', '精灵蛋'];

// 分组缺失 / 填错时的兜底分组
const ITEM_FALLBACK_GROUP = {
    name: '其他道具',
    icon: 'fa-solid fa-box',
    color: '#8d99ae'
};

const ITEM_BUILTIN_GROUPS = [
    { name: '咕噜球', icon: 'fa-solid fa-baseball', color: '#4dabf7' },
    { name: '精灵培养', icon: 'fa-solid fa-seedling', color: '#51cf66' },
    { name: '种植与礼物', icon: 'fa-solid fa-gift', color: '#f783ac' },
    { name: '魔法与素材', icon: 'fa-solid fa-wand-magic-sparkles', color: '#9775fa' },
    { name: '货币与资源', icon: 'fa-solid fa-coins', color: '#f0b429' },
    Object.assign({}, ITEM_FALLBACK_GROUP)
];

// 新建分组时按名称 hash 取色，保证同一个名字每次颜色都一样
const ITEM_GROUP_PALETTE = [
    '#4dabf7', '#51cf66', '#f783ac', '#9775fa', '#f0b429',
    '#ff922b', '#20c997', '#e64980', '#7048e8', '#1098ad'
];
const ITEM_DEFAULT_GROUP_ICON = 'fa-solid fa-box';

/* 后台「分组图标」可选项：Font Awesome 6 Free Solid，新建分组时点一下即可换 */
const ITEM_GROUP_ICONS = [
    'fa-solid fa-box', 'fa-solid fa-box-open', 'fa-solid fa-boxes-stacked', 'fa-solid fa-layer-group',
    'fa-solid fa-cube', 'fa-solid fa-cubes', 'fa-solid fa-bag-shopping', 'fa-solid fa-cart-shopping',
    'fa-solid fa-gem', 'fa-solid fa-key', 'fa-solid fa-gift', 'fa-solid fa-ticket', 'fa-solid fa-tags',
    'fa-solid fa-seedling', 'fa-solid fa-leaf', 'fa-solid fa-tree', 'fa-solid fa-apple-whole', 'fa-solid fa-carrot',
    'fa-solid fa-drumstick-bite', 'fa-solid fa-cake-candles', 'fa-solid fa-bowl-food', 'fa-solid fa-fish',
    'fa-solid fa-egg', 'fa-solid fa-paw', 'fa-solid fa-bone',
    'fa-solid fa-flask', 'fa-solid fa-flask-vial', 'fa-solid fa-vial', 'fa-solid fa-pills',
    'fa-solid fa-prescription-bottle', 'fa-solid fa-wand-magic-sparkles', 'fa-solid fa-hat-wizard', 'fa-solid fa-scroll',
    'fa-solid fa-book', 'fa-solid fa-book-open', 'fa-solid fa-map', 'fa-solid fa-compass',
    'fa-solid fa-sack-dollar', 'fa-solid fa-coins', 'fa-solid fa-money-bill', 'fa-solid fa-star',
    'fa-solid fa-crown', 'fa-solid fa-shield-halved', 'fa-solid fa-heart', 'fa-solid fa-fire',
    'fa-solid fa-droplet', 'fa-solid fa-bolt', 'fa-solid fa-snowflake', 'fa-solid fa-moon', 'fa-solid fa-sun',
    'fa-solid fa-feather', 'fa-solid fa-shoe-prints', 'fa-solid fa-hammer', 'fa-solid fa-screwdriver-wrench',
    'fa-solid fa-gear', 'fa-solid fa-anchor', 'fa-solid fa-rocket', 'fa-solid fa-bell',
    'fa-solid fa-clock', 'fa-solid fa-hourglass', 'fa-solid fa-camera', 'fa-solid fa-envelope',
    'fa-solid fa-magnifying-glass', 'fa-solid fa-music', 'fa-solid fa-palette', 'fa-solid fa-paintbrush',
    'fa-solid fa-dice', 'fa-solid fa-basketball', 'fa-solid fa-mobile-screen', 'fa-solid fa-microchip'
];

const hashItemGroupColor = (name) => {
    const str = String(name || '');
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 100000;
    return ITEM_GROUP_PALETTE[h % ITEM_GROUP_PALETTE.length];
};

/* --------------------------------------------------------- 数据文件覆盖 */
// data/items-data.js 里若声明了同名变量，就用它替换内置默认
const pickOverride = (name) => {
    try {
        // 用 Function 取值，避免变量未声明时直接 ReferenceError
        const val = new Function('try { return typeof ' + name + ' !== "undefined" ? ' + name + ' : null; } catch (e) { return null; }')();
        return Array.isArray(val) ? val : null;
    } catch (e) {
        return null;
    }
};

const itemKinds = (() => {
    const extra = pickOverride('itemKindsData');
    const list = (extra || ITEM_BUILTIN_KINDS)
        .map(k => String(k == null ? '' : k).trim())
        .filter(Boolean);
    return list.length ? list : ITEM_BUILTIN_KINDS.slice();
})();

const itemGroups = (() => {
    const extra = pickOverride('itemGroupsData');
    const src = extra || ITEM_BUILTIN_GROUPS;
    const list = src.map(g => {
        const name = String((g && g.name) || '').trim();
        if (!name) return null;
        return {
            name,
            icon: (g && g.icon) || ITEM_DEFAULT_GROUP_ICON,
            color: (g && g.color) || hashItemGroupColor(name)
        };
    }).filter(Boolean);
    return list.length ? list : ITEM_BUILTIN_GROUPS.map(g => Object.assign({}, g));
})();

const itemCategories = (() => {
    const extra = pickOverride('itemCategoriesData');
    if (!extra) return [];
    return extra.map(s => String(s == null ? '' : s).trim()).filter(Boolean);
})();

/* ------------------------------------------------------------ 运行时替换 */
// 后台增删改后调用，保持下面的 getItemGroupIcon / normalizeItemKind 拿到最新列表
const setItemKinds = (list) => {
    itemKinds.length = 0;
    (list || []).forEach(k => itemKinds.push(String(k)));
};
const setItemGroups = (list) => {
    itemGroups.length = 0;
    (list || []).forEach(g => itemGroups.push({
        name: String(g.name),
        icon: g.icon || ITEM_DEFAULT_GROUP_ICON,
        color: g.color || hashItemGroupColor(g.name)
    }));
};
const setItemCategories = (list) => {
    itemCategories.length = 0;
    (list || []).forEach(c => itemCategories.push(String(c)));
};

/* ---------------------------------------------------------------- 查询 */
const getItemGroupInfo = (name) => itemGroups.find(g => g.name === name) || ITEM_FALLBACK_GROUP;
const getItemGroupIcon = (name) => getItemGroupInfo(name).icon;
const getItemGroupColor = (name) => getItemGroupInfo(name).color;

// 「全部」这颗胶囊用的图标
const ITEM_ALL_ICON = 'fa-solid fa-layer-group';

// 物品大类归一：空值 / 未知值落到第一个大类
const normalizeItemKind = (kind) => (itemKinds.includes(kind) ? kind : (itemKinds[0] || ITEM_BUILTIN_KINDS[0]));

// 图标兜底：没配图标字体时用分组图标
const getItemFallbackIcon = (item) => getItemGroupIcon(item && item.group);
const getItemFallbackColor = (item) => getItemGroupColor(item && item.group);

// 新建分组 / 查询颜色用
const makeItemGroup = (name) => {
    const n = String(name || '').trim();
    return { name: n, icon: ITEM_DEFAULT_GROUP_ICON, color: hashItemGroupColor(n) };
};
