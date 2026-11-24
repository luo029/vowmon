/* ==========================================================================
   Vowmon Wiki 物品配置 —— 类型 / 分组 的唯一来源
   --------------------------------------------------------------------------
   前台 items.html 与后台 admin-items.html 都引用本文件，禁止在页面里写死分组名或配色。

   · itemKinds：物品大类（对应图鉴顶部的 Tab）。数据里实际出现两个及以上大类时，
     顶部才会显示 Tab 栏；只有一个大类时自动隐藏，避免出现孤零零一个按钮。
   · itemGroups：物品分组（对应图鉴的筛选胶囊）。新增分组只改这里，
     后台下拉与前台筛选会自动跟着变；数据里没用到的分组不会显示。
   ========================================================================== */

const itemKinds = ['物品', '精灵果实', '精灵蛋'];

// 默认的「其他」分组：分组缺失 / 填错时的兜底
const ITEM_FALLBACK_GROUP = {
    name: '其他道具',
    icon: 'fa-solid fa-box',
    color: '#8d99ae'
};

const itemGroups = [
    { name: '咕噜球', icon: 'fa-solid fa-baseball', color: '#4dabf7' },
    { name: '精灵培养', icon: 'fa-solid fa-seedling', color: '#51cf66' },
    { name: '种植与礼物', icon: 'fa-solid fa-gift', color: '#f783ac' },
    { name: '魔法与素材', icon: 'fa-solid fa-wand-magic-sparkles', color: '#9775fa' },
    { name: '货币与资源', icon: 'fa-solid fa-coins', color: '#f0b429' },
    ITEM_FALLBACK_GROUP
];

// 分组名 -> 分组信息（未知分组自动落到「其他道具」）
const getItemGroupInfo = (name) => itemGroups.find(g => g.name === name) || ITEM_FALLBACK_GROUP;
const getItemGroupIcon = (name) => getItemGroupInfo(name).icon;
const getItemGroupColor = (name) => getItemGroupInfo(name).color;

// 全部道具的筛选图标（「全部」这一颗胶囊用）
const ITEM_ALL_ICON = 'fa-solid fa-layer-group';

// 物品大类归一：空值 / 未知值落到「物品」
const normalizeItemKind = (kind) => (itemKinds.includes(kind) ? kind : itemKinds[0]);

// 图标兜底：没配图标字体时用分组图标
const getItemFallbackIcon = (item) => getItemGroupIcon(item && item.group);
const getItemFallbackColor = (item) => getItemGroupColor(item && item.group);
