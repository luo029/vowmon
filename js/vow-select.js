/* ==========================================================================
   Vowmon 自定义下拉选择组件 vow-select
   --------------------------------------------------------------------------
   为什么要有它：原生 <select> 弹出的下拉菜单是操作系统样式的「系统弹窗」，
   无法配色、无法带说明文字、移动端更丑。本组件用纯 Vue 自绘菜单，
   视觉与站点弹窗（css/dialog.css）一致。

   用法（后台页面在 createApp 后注册）：
     const app = createApp({ ... });
     app.component('vow-select', window.VowSelect);
     app.mount('#app');

     <vow-select v-model="form.ownerId" :options="ownerOptions"
                 placeholder="（未定 / 无主）"></vow-select>

   options 支持两种形式：
     ['雄', '雌']                                    → 纯字符串
     [{ value: '怕寂寞', label: '怕寂寞', hint: '+攻击 -防御' }]
   注意：in-DOM 模板里必须写 <vow-select ...></vow-select>，不能自闭合。
   ========================================================================== */
(function () {
    'use strict';
    if (window.VowSelect) return;

    window.VowSelect = {
        name: 'VowSelect',
        props: {
            modelValue: { type: String, default: '' },
            options: { type: Array, default: function () { return []; } },
            placeholder: { type: String, default: '请选择' },
            disabled: { type: Boolean, default: false }
        },
        emits: ['update:modelValue'],
        data: function () { return { open: false }; },
        computed: {
            list: function () {
                return (this.options || []).map(function (o) {
                    if (typeof o === 'string') return { value: o, label: o, hint: '' };
                    return {
                        value: String(o.value),
                        label: String(o.label != null ? o.label : o.value),
                        hint: o.hint || ''
                    };
                });
            },
            current: function () {
                var v = this.modelValue;
                return this.list.find(function (o) { return o.value === v; }) || null;
            }
        },
        methods: {
            toggle: function () { if (!this.disabled) this.open = !this.open; },
            pick: function (o) { this.$emit('update:modelValue', o.value); this.open = false; },
            onDoc: function (e) {
                if (this.open && this.$el && !this.$el.contains(e.target)) this.open = false;
            },
            onKey: function (e) {
                if (e.key === 'Escape' && this.open) { e.stopPropagation(); this.open = false; }
            }
        },
        mounted: function () { document.addEventListener('click', this.onDoc); },
        unmounted: function () { document.removeEventListener('click', this.onDoc); },
        template:
            '<div class="vsel" :class="{ open: open, disabled: disabled }" @keydown="onKey">' +
            '  <button type="button" class="vsel-trigger" :disabled="disabled" @click.stop="toggle">' +
            '    <span class="vsel-label" v-if="current">{{ current.label }}<small class="vsel-hint" v-if="current.hint">{{ current.hint }}</small></span>' +
            '    <span class="vsel-placeholder" v-else>{{ placeholder }}</span>' +
            '    <i class="fa-solid fa-chevron-down vsel-arrow"></i>' +
            '  </button>' +
            '  <transition name="vsel">' +
            '    <div class="vsel-menu" v-if="open">' +
            '      <div class="vsel-opt" v-for="o in list" :key="o.value"' +
            '           :class="{ on: o.value === modelValue }" @click.stop="pick(o)">' +
            '        <span class="vsel-opt-label">{{ o.label }}<small class="vsel-hint" v-if="o.hint">{{ o.hint }}</small></span>' +
            '        <i class="fa-solid fa-check vsel-opt-check" v-if="o.value === modelValue"></i>' +
            '      </div>' +
            '      <div class="vsel-empty" v-if="!list.length">暂无可选项</div>' +
            '    </div>' +
            '  </transition>' +
            '</div>'
    };
})();
