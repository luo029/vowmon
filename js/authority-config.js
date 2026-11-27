/* ==========================================================================
   Vowmon Wiki —— 权柄看板规则（力 · 位 · 权）唯一来源
   --------------------------------------------------------------------------
   数据来自「世界观 · 等级体系 / 血脉 / 御兽师图鉴」正典（lore-data.json），
   这里只是把规则结构化为可交互数据；世界观正文仍以 lore-data.json 为准。
   暴露 window.AuthorityConfig：LAWS / RANKS / CYCLE / MECHANISMS / isAuthorityEvent
   ========================================================================== */
(function () {
    'use strict';

    var LAWS = [
        {
            key: 'power', name: '力', sub: '战力', icon: 'fa-solid fa-fist-raised', color: '#e8590c',
            desc: '精灵自身的数值面板与技能，是纯粹的实力。有【力】不需要争夺，修炼就能增长。'
        },
        {
            key: 'niche', name: '位', sub: '生态位', icon: 'fa-solid fa-layer-group', color: '#1971c2',
            desc: '精灵在生态界中占据的位置。多数情况是先占据生态位，才有相应的【力】，之后才谈得上争夺【权】。'
        },
        {
            key: 'authority', name: '权', sub: '权柄', icon: 'fa-solid fa-crown', color: '#d9480f',
            desc: '生态界的「唯一管理员账号」：对应精灵全服只有一只，只能通过战斗争夺。掌权者可以修改规则、给下位精灵增幅。'
        }
    ];

    // 精灵八阶 ↔ 御兽师八阶 ↔ 掌权权限（rank / stage name 与 stages-data.json 对齐）
    var RANKS = [
        { stage: '初灵', level: '1-15', trainer: '初生', title: '—', authority: '无权限',
          power: '基础觉醒：掌握本能技能，纯看数值。', note: '一阶一界，先有【位】再修【力】。' },
        { stage: '升灵', level: '16-35', trainer: '精英', title: '—', authority: '无权限',
          power: '形态跃迁：完成进化，技能体系成型。', note: '种族值低的精灵可能没有升灵期。' },
        { stage: '族尊', level: '36-50', trainer: '职业', title: '—', authority: '同族借力',
          power: '种群之主：统御同科，技能产生共鸣。', note: '一吼借来同科力量，代价是背负整个「科」的托举。' },
        { stage: '基座', level: '51-60', trainer: '枢座', title: '首座（各属性最强枢座）', authority: '修改技能特效',
          power: '生命支点：统合多科特征，技能绝对特效。', note: '如火系定下【不灭法则】，全境火系技能浇灭后仍燃烧。' },
        { stage: '灵相', level: '61-70', trainer: '承相', title: '太宰（地区四大承相）', authority: '修改环境规则',
          power: '自然之踪：行为与现象的极致概念。', note: '火山地形从此火克水——局部改写环境。' },
        { stage: '律冠', level: '71-89', trainer: '司律', title: '大冠（地区最强训练家，动态头衔）', authority: '反转全图克制',
          power: '生态化身：生态界的外在表现。', note: '全图广播：火系技能全变爆炸；正面夺权成功即全图改克制。' },
        { stage: '元灵', level: '90-99', trainer: '掌元', title: '盟主 / 戎枢（联盟权职）', authority: '重写底层法则',
          power: '界主：生态界本身。', note: '宇宙根目录级改写，永久生效；不可被契约。' },
        { stage: '元', level: '100+', trainer: '无对应', title: '—', authority: '不可达',
          power: '创世神：最初精灵，已失踪。', note: '等级上限 99；100 级只存在于传说。' }
    ];

    var CYCLE = [
        { n: 1, title: '解契', desc: '精灵要夺权，御兽师必须放生。' },
        { n: 2, title: '争夺权柄', desc: '打赢现任掌权者。' },
        { n: 3, title: '晋位进化', desc: '借权柄完成进化。' },
        { n: 4, title: '主动放权', desc: '把权柄扔给野生精灵。' },
        { n: 5, title: '重新契约', desc: '负担消失，永远在一起。' }
    ];

    var MECHANISMS = [
        { name: '托举机制', icon: 'fa-solid fa-people-arrows', color: '#7048e8',
          desc: '掌权精灵抽取下位同属性精灵的力量维持统治——下位托举上位。掌权负担极其沉重，御兽师会被瞬间抽干。' },
        { name: '摇人机制', icon: 'fa-solid fa-phone-volume', color: '#1971c2',
          desc: '平时不掌权，大战时御兽师通过感应把「掌权的大佬精灵」摇来帮忙；还要替托举的精灵分担部分重量。' },
        { name: '放权机制', icon: 'fa-solid fa-hand-holding-heart', color: '#2f9e44',
          desc: '晋位完成后主动把【权】下放给野生精灵，负担消失即可重新契约，永远在一起。' }
    ];

    // 从里程碑文案里识别与权柄相关的历史事件
    var KEYWORDS = /权柄|夺权|掌权|放权|解契|契约|晋位|进化|托举|放生|生态界震动|律冠|界主|权柄精灵/;

    function isAuthorityEvent(text) { return KEYWORDS.test(String(text || '')); }

    window.AuthorityConfig = Object.freeze({
        LAWS: LAWS, RANKS: RANKS, CYCLE: CYCLE, MECHANISMS: MECHANISMS,
        isAuthorityEvent: isAuthorityEvent
    });
})();
