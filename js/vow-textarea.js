/* ==========================================================================
   Vowmon 长文本编辑器 vow-textarea
   --------------------------------------------------------------------------
   普通 textarea 输入长了会出现内部滚动条、看不全。
   本组件：默认随内容自动增高（无滚动条），右侧「放大」按钮打开大编辑弹窗。
   用法：<vow-textarea v-model="form.background" :rows="3"></vow-textarea>
   注册：app.component('vow-textarea', window.VowTextarea);
   ========================================================================== */
(function () {
    'use strict';
    if (window.VowTextarea) return;

    window.VowTextarea = {
        name: 'VowTextarea',
        props: {
            modelValue: { type: String, default: '' },
            rows: { type: Number, default: 2 }
        },
        emits: ['update:modelValue'],
        data: function () { return { expanded: false }; },
        methods: {
            grow: function (e) {
                var t = e && e.target;
                if (!t) return;
                t.style.height = 'auto';
                var h = Math.max(t.scrollHeight, 56) + 'px';
                requestAnimationFrame(function () { t.style.height = h; });
            },
            onInput: function (e) {
                this.$emit('update:modelValue', e.target.value);
                this.grow(e);
            },
            onBigInput: function (e) { this.$emit('update:modelValue', e.target.value); },
            toggle: function () {
                this.expanded = !this.expanded;
                if (this.expanded) {
                    var self = this;
                    this.$nextTick(function () { self.grow({ target: self.$refs.big }); });
                }
            },
            done: function () {
                this.expanded = false;
                var self = this;
                this.$nextTick(function () { self.grow({ target: self.$refs.small }); });
            }
        },
        watch: {
            modelValue: function () {
                var self = this;
                this.$nextTick(function () { self.grow({ target: self.$refs.small }); });
            }
        },
        mounted: function () { this.grow({ target: this.$refs.small }); },
        template:
            '<div class="vta">' +
            '  <div class="vta-row">' +
            '    <textarea ref="small" class="vta-small" :rows="rows" :value="modelValue" @input="onInput"></textarea>' +
            '    <button type="button" class="vta-expand" @click="toggle" title="放大编辑"><i class="fa-solid fa-expand"></i></button>' +
            '  </div>' +
            '  <teleport to="body">' +
            '    <div class="vta-overlay" v-if="expanded" @click.self="done">' +
            '      <div class="vta-modal">' +
            '        <div class="vta-head"><b>放大编辑</b><button type="button" class="btn-close" @click="done"><i class="fa-solid fa-xmark"></i></button></div>' +
            '        <textarea ref="big" class="vta-big" :value="modelValue" @input="onBigInput"></textarea>' +
            '        <div class="vta-foot"><button type="button" class="btn btn-primary btn-sm" @click="done"><i class="fa-solid fa-check"></i> 完成</button></div>' +
            '      </div>' +
            '    </div>' +
            '  </teleport>' +
            '</div>'
    };
})();
