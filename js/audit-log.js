/* ==========================================================================
   Vowmon Wiki —— 后台操作审计日志
   --------------------------------------------------------------------------
   记录数据变更 / 同步 / 拉取，可查看、导出、清空，并从快照恢复。
   存储：localStorage['vowmon_audit_log']（最多 200 条，最新在前）。
   暴露 window.AuditLog = { record, list, clear, restore, exportText }
   ========================================================================== */
(function () {
    'use strict';
    var KEY = 'vowmon_audit_log';
    var MAX = 200;

    function read() {
        try { var a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; }
        catch (e) { return []; }
    }
    function write(list) {
        try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch (e) { /* 容量满时静默 */ }
    }
    function record(action, detail, snapshot) {
        var entry = {
            time: new Date().toISOString(),
            action: String(action || '操作'),
            detail: String(detail || ''),
            page: window.location.pathname.split('/').pop() || 'index.html',
            snapshot: snapshot === undefined ? null : snapshot
        };
        var list = read();
        list.unshift(entry);
        write(list);
        return entry;
    }
    function list() { return read(); }
    function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }
    function restore(index) {
        var l = read();
        var e = l[index];
        if (!e || !e.snapshot) return false;
        var snap = e.snapshot;
        Object.keys(snap).forEach(function (key) {
            if (snap[key] === null) try { localStorage.removeItem(key); } catch (err) {}
            else try { localStorage.setItem(key, typeof snap[key] === 'string' ? snap[key] : JSON.stringify(snap[key])); } catch (err) {}
        });
        record('从快照恢复', '恢复到 ' + e.time + ' 的记录');
        return true;
    }
    function exportText() {
        return JSON.stringify(read(), null, 2);
    }
    window.AuditLog = Object.freeze({ record: record, list: list, clear: clear, restore: restore, exportText: exportText, KEY: KEY });
})();
