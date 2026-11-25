/* 临时测试：diff-modal.js 的差异计算与合并逻辑（node 环境跑完即删） */
global.window = {};
global.localStorage = { getItem: () => null };
function fakeNode() {
    return {
        style: {}, dataset: {},
        classList: { add() {}, remove() {}, toggle() {} },
        appendChild() {}, addEventListener() {}, setAttribute() {},
        querySelector() { return null; },
        textContent: ''
    };
}
global.document = {
    createElement: () => fakeNode(),
    createTextNode: () => ({}),
    addEventListener() {}, removeEventListener() {},
    body: { appendChild() {} }
};
require(__dirname + '/../js/diff-modal.js');
const VD = window.VowmonDiff;

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('PASS:', msg); };

// ---- 构造差异（绕过 review 的 DOM 路径：直接用内部逻辑不导出，改为走 review + 完整 DOM 桩）----
// review 需要 buildNode；DOM 桩已静默所有操作，但 buildNode 里 closeBtn.addEventListener 桩化了，finish 永远不会被用户触发，
// 所以这里手工取 job：review 返回 Promise 挂起，我们从 window.VowmonDiff 无法拿到 job……
// 更简单：直接测 same / fmt / mergeSection，mergeSection 需要 items —— 自己造 items。
const sec = { label: '精灵', local: [
        { id: 1, name: '小火狐', types: ['火'], level: 12 },
        { id: 2, name: '水灵龟', types: ['水'], level: 20 },
        { id: 4, name: '风隼', types: ['风'], level: 8 }
    ], remote: [
        { id: 1, name: '小火狐', types: ['火', '雷'], level: 12 },
        { id: 2, name: '水灵龟', types: ['水'], level: 30 },
        { id: 3, name: '岩甲兽', types: ['岩'], level: 5 }
    ], key: v => v.id, name: v => v.name };

assert(VD.same({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }) === true, 'same 键序无关');
assert(VD.same({ a: 1 }, { a: 2 }) === false, 'same 值不同');
assert(VD.same(undefined, null) === false, 'same undefined vs null');

// push：本机有 4(新增)、1/2 有修改、云端有 3(删除)
const itemsPush = [
    { key: '1', type: 'modified', selected: true, localValue: sec.local[0], remoteValue: sec.remote[0] },
    { key: '2', type: 'modified', selected: false, localValue: sec.local[1], remoteValue: sec.remote[1] },
    { key: '3', type: 'removed', selected: false, localValue: undefined, remoteValue: sec.remote[2] },
    { key: '4', type: 'added', selected: true, localValue: sec.local[2], remoteValue: undefined }
];
const pushed = VD.mergeSection('push', sec, itemsPush);
assert(pushed.length === 4, 'push 合并后 4 条（1改+2未改+3保留+4新增）');
assert(pushed.find(v => v.id === 1).types.join(',') === '火', 'push: 勾选的修改取本机值');
assert(pushed.find(v => v.id === 2).level === 30, 'push: 未勾选的修改保持云端值');
assert(pushed.some(v => v.id === 3), 'push: 未勾选的删除项保留');
assert(pushed.some(v => v.id === 4), 'push: 新增项并入');

// push：勾选删除 3
itemsPush[2].selected = true;
const pushed2 = VD.mergeSection('push', sec, itemsPush);
assert(!pushed2.some(v => v.id === 3) && pushed2.length === 3, 'push: 勾选删除后云端独有项被删');

// pull：基础为本机，勾选的 modified 取云端值
const itemsPull = [
    { key: '1', type: 'modified', selected: true, localValue: sec.local[0], remoteValue: sec.remote[0] },
    { key: '2', type: 'modified', selected: false, localValue: sec.local[1], remoteValue: sec.remote[1] },
    { key: '4', type: 'removed', selected: false, localValue: sec.local[2], remoteValue: undefined },
    { key: '3', type: 'added', selected: true, localValue: undefined, remoteValue: sec.remote[2] }
];
const pulled = VD.mergeSection('pull', sec, itemsPull);
assert(pulled.find(v => v.id === 1).types.join(',') === '火,雷', 'pull: 勾选的修改取云端值');
assert(pulled.find(v => v.id === 2).level === 20, 'pull: 未勾选的本机草稿保留');
assert(pulled.some(v => v.id === 4), 'pull: 未勾选的本机独有保留');
assert(pulled.some(v => v.id === 3), 'pull: 勾选的云端新增拉入');

// map 段：families / lore blocks
const mapSec = { label: '技能包', kind: 'map',
    local: { 火族: { skills: ['a'] }, 风族: { skills: ['c'] } },
    remote: { 火族: { skills: ['b'] }, 水族: { skills: ['d'] } } };
const mapItems = [
    { key: '火族', type: 'modified', selected: true, localValue: { skills: ['a'] }, remoteValue: { skills: ['b'] } },
    { key: '风族', type: 'added', selected: true, localValue: { skills: ['c'] }, remoteValue: undefined },
    { key: '水族', type: 'removed', selected: false, localValue: undefined, remoteValue: { skills: ['d'] } }
];
const mapPushed = VD.mergeSection('push', mapSec, mapItems);
assert(mapPushed['火族'].skills[0] === 'a', 'map push: 勾选修改取本机');
assert(mapPushed['水族'] && mapPushed['风族'], 'map push: 新增并入、未勾选删除保留');
console.log('ALL DONE');
