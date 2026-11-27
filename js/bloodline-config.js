/* ==========================================================================
   Vowmon Wiki —— 血脉共鸣规则（石之共鸣 · 四大后天血脉）唯一来源
   原型参照仅助记，非世界设定。世界观正文以 lore-data.json 为准。
   暴露 window.BloodlineConfig：TYPES / VERSE / isBloodlineEvent
   ========================================================================== */
(function () {
    'use strict';

    var TYPES = [
        {
            key: 'mutation', name: '异变血脉', stone: '异变之石', icon: 'fa-solid fa-dna', color: '#7048e8',
            alias: '可控、可逆的异变', prototype: '原型参照：Mega 进化 —— 仅助记，非世界设定',
            form: '改变自身形态', power: '战力大幅度增强', reversible: true, fixedFour: false,
            desc: '御兽师持【异变之石】与精灵的异变血脉共鸣，产生可控、可逆的异变：形态改变、战力暴涨，随时可以恢复原样。'
        },
        {
            key: 'dark', name: '黑暗血脉', stone: '黑暗之石', icon: 'fa-solid fa-moon', color: '#495057',
            alias: '隐血脉 / 暗血脉 / 月（夜）血脉', prototype: '原型参照：Z 招式 —— 仅助记，非世界设定',
            form: '散发黑暗、堕落、邪恶气息', power: '神智提高、招式威力提高，但容易叛逆', fixedFour: true,
            desc: '共鸣后对应精灵被称作【邪恶精灵 / 黑暗精灵】：固定四技能且必带一个强大技能，形态改变，神智与威力提高——容易叛逆。'
        },
        {
            key: 'light', name: '光明血脉', stone: '光明之石', icon: 'fa-solid fa-sun', color: '#f59f00',
            alias: '显血脉 / 明血脉 / 日（昼）血脉', prototype: '原型参照：Z 招式 —— 仅助记，非世界设定',
            form: '散发光明、神圣、正义气息', power: '固定四技能（随机他系）+ 必带强大技能', fixedFour: true,
            desc: '共鸣后对应精灵被称作【正义精灵 / 光明精灵】：固定四技能，技能随机其他属性不一定本系，且必带一个强大技能。'
        },
        {
            key: 'attribute', name: '属性血脉', stone: '属性之石', icon: 'fa-solid fa-gem', color: '#1971c2',
            alias: '属性共鸣 · 族群技能', prototype: '原型参照：太晶化 + 太晶爆发 —— 仅助记，非世界设定',
            form: '小幅改变模样，偏向对应属性特征', power: '+1 血脉技能（族群技能）+1 属性技能【本心一击】', fixedFour: false,
            desc: '与【属性血脉】共鸣：精灵多出一个血脉技能与一个属性技能。属性技能【本心一击】为固定技能，所有精灵都有；血脉技能取决于所在族群【族尊】给予的族群技能，随时可能改变。'
        }
    ];

    var VERSE = [
        '先天锁主系，后天四选一。',
        '石为钥 · 血为门，共鸣起 · 形态变。',
        '血脉不渡克制——水仍灭火。'
    ];

    window.BloodlineConfig = Object.freeze({ TYPES: TYPES, VERSE: VERSE });
})();
