/* ==========================================================================
   Vowmon Wiki —— 技能分类配置（全局唯一来源）
   --------------------------------------------------------------------------
   仿照 type-config.js 的属性配置：技能只有「物理 / 特殊 / 变化」三类，
   每类的图标（Font Awesome）、主题色、英文名都在这里统一维护。
   凡是展示技能分类的地方（前台图鉴 / 后台管理）都必须引用本文件，
   禁止在各页面里写死图标类名或色值。

   图标选用思路（贴近宝可梦官方观感，但用 FA 图标，无需图片资源）：
     物理 Physical -> fa-burst      放射星芒（橙红）
     特殊 Special  -> fa-bullseye   同心圆靶环（蓝）
     变化 Status   -> fa-yin-yang   阴阳（灰）
   ========================================================================== */

const categoryData = [
    { name: '物理', en: 'Physical', icon: 'fa-solid fa-burst', color: '#E8592C' },
    { name: '特殊', en: 'Special', icon: 'fa-solid fa-bullseye', color: '#3B82F6' },
    { name: '变化', en: 'Status', icon: 'fa-solid fa-yin-yang', color: '#9AA5B1' }
];

// 分类名列表（供筛选按钮 / 下拉选项遍历）
const categoryNames = categoryData.map(c => c.name);

// 按名称取完整信息，找不到时回退到第一类
const getCategoryInfo = (name) => categoryData.find(c => c.name === name) || categoryData[0];
// 取图标类名 / 主题色
const getCategoryIcon = (name) => getCategoryInfo(name).icon;
const getCategoryColor = (name) => getCategoryInfo(name).color;
