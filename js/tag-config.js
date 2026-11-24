/* ==========================================================================
   Vowmon Wiki —— 技能标签配置（标签库唯一来源）
   --------------------------------------------------------------------------
   标签用于描述技能的效果特征（如「回血」「先手」「异常」），一个技能可以有
   0 个或多个标签。内置标签 + 用户在后台自定义的标签共同组成「标签库」。

   持久化：自定义/删除后的完整标签库存 localStorage['vowmon_tags_library']，
   后台「技能管理」可搜索、新建、删除标签；前台同源读取同一份库。
   部署到公网后访客浏览器没有该 localStorage，此时未知标签会按名称 hash
   生成稳定的图标与配色，保证展示与筛选不报错、前后台观感一致。

   图标使用 Font Awesome 6.4，无需图片资源。
   ========================================================================== */

// 内置标签（首次初始化标签库时使用）
const BUILTIN_TAG_DATA = [
    { name: '异常', icon: 'fa-solid fa-biohazard', color: '#805ad5' },
    { name: '回血', icon: 'fa-solid fa-heart-pulse', color: '#38a169' },
    { name: '回能', icon: 'fa-solid fa-bolt', color: '#d69e2e' },
    { name: '先手', icon: 'fa-solid fa-forward', color: '#319795' },
    { name: '强化', icon: 'fa-solid fa-arrow-up', color: '#dd6b20' },
    { name: '削弱', icon: 'fa-solid fa-arrow-down', color: '#4a5568' },
    { name: '连击', icon: 'fa-solid fa-burst', color: '#e53e3e' },
    { name: '印记', icon: 'fa-solid fa-bookmark', color: '#5a67d8' },
    { name: '驱散', icon: 'fa-solid fa-broom', color: '#00b5ad' },
    { name: '天气', icon: 'fa-solid fa-cloud-sun', color: '#4299e1' },
    { name: '应对', icon: 'fa-solid fa-shield-halved', color: '#718096' },
    { name: '离场', icon: 'fa-solid fa-door-open', color: '#a0aec0' },
    { name: '打断', icon: 'fa-solid fa-hand', color: '#ed8936' },
    { name: '奉献', icon: 'fa-solid fa-hands-holding-heart', color: '#d53f8c' },
    { name: '进攻', icon: 'fa-solid fa-swords', color: '#e53e3e' },
    { name: '防护', icon: 'fa-solid fa-shield', color: '#4299e1' },
    { name: '暴击', icon: 'fa-solid fa-star', color: '#d69e2e' },
    { name: '中毒', icon: 'fa-solid fa-skull-crossbones', color: '#805ad5' },
    { name: '灼伤', icon: 'fa-solid fa-fire', color: '#dd6b20' },
    { name: '麻痹', icon: 'fa-solid fa-zap', color: '#d69e2e' },
    { name: '睡眠', icon: 'fa-solid fa-moon', color: '#5a67d8' },
    { name: '冰冻', icon: 'fa-solid fa-snowflake', color: '#4299e1' },
    { name: '混乱', icon: 'fa-solid fa-circle-question', color: '#718096' }
];

const TAG_STORAGE_KEY = 'vowmon_tags_library';

// 自定义标签自动分配的图标池与配色池
const AUTO_TAG_ICONS = [
    'fa-solid fa-tag', 'fa-solid fa-star', 'fa-solid fa-fire', 'fa-solid fa-bolt',
    'fa-solid fa-heart', 'fa-solid fa-shield', 'fa-solid fa-sword', 'fa-solid fa-sparkles',
    'fa-solid fa-magic', 'fa-solid fa-gem', 'fa-solid fa-wind', 'fa-solid fa-seedling'
];
const AUTO_TAG_COLORS = [
    '#e53e3e', '#dd6b20', '#d69e2e', '#38a169', '#319795', '#4299e1',
    '#5a67d8', '#805ad5', '#d53f8c', '#718096', '#00b5ad', '#ed8936'
];

// 稳定 hash：同名标签在任何浏览器都得到相同的图标与颜色
function hashTagString(str) {
    let h = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

function autoTagStyle(name) {
    const h = hashTagString(name);
    return {
        icon: AUTO_TAG_ICONS[h % AUTO_TAG_ICONS.length],
        color: AUTO_TAG_COLORS[(h >>> 4) % AUTO_TAG_COLORS.length]
    };
}

// 读取当前标签库（内置 + 用户自定义/删除后的完整列表）
function getTagLibrary() {
    let list = null;
    try {
        const raw = localStorage.getItem(TAG_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) list = parsed;
        }
    } catch (e) { /* localStorage 不可用时回退内置库 */ }
    // 只有「从未设置」才回退内置；空数组表示用户主动删空了全部标签，需保留
    if (list === null) list = JSON.parse(JSON.stringify(BUILTIN_TAG_DATA));
    // 兜底：补全缺失的 icon / color，保证任何来源的标签都能正常渲染
    return list.filter(t => t && t.name).map(t => {
        const auto = autoTagStyle(t.name);
        return { name: String(t.name), icon: t.icon || auto.icon, color: t.color || auto.color };
    });
}

function saveTagLibrary(list) {
    try {
        localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(list));
    } catch (e) { /* 存储不可用时仅影响持久化，不影响当前会话 */ }
}

// 创建一个新标签对象（后台「新建标签」用）
function makeCustomTag(name) {
    const clean = String(name == null ? '' : name).trim();
    const style = autoTagStyle(clean);
    return { name: clean, icon: style.icon, color: style.color };
}

// 兼容旧引用：tagData / tagNames 为页面加载时的标签库快照
const tagData = getTagLibrary();
const tagNames = tagData.map(t => t.name);

// 实时查询（每次读取标签库，保证后台新增/删除后立即生效）
const getTagInfo = (name) => {
    const found = getTagLibrary().find(t => t.name === name);
    if (found) return found;
    const auto = autoTagStyle(name);
    return { name: String(name || ''), ...auto };
};
const getTagIcon = (name) => getTagInfo(name).icon;
const getTagColor = (name) => getTagInfo(name).color;
