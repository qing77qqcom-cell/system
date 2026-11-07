<script setup>
/**
 * 全局入口：主题色 + 移动端基础响应式
 *
 * 设计原则：
 *   1) 用 @media (max-width: 768px) 作为"手机/PC 分界"（和 Element Plus 内置断点一致）
 *   2) 全局样式用 :deep 覆盖 Element Plus 组件，单页样式优先 scoped
 *   3) 尽量不破坏 PC 端布局，只在窄屏时做降级
 */
import { onMounted, onUnmounted } from 'vue'
import { useMobile } from '@/composables/useMobile.js'
const { isMobile } = useMobile()

// 给 <html> 加 data-mobile 属性，方便组件里用 html[data-mobile="true"] 精准覆盖
onMounted(() => {
  const sync = () => {
    document.documentElement.dataset.mobile = isMobile.value ? 'true' : 'false'
  }
  sync()
  window.__syncMobile = sync
  window.addEventListener('resize', sync)
  window.addEventListener('orientationchange', sync)
})
onUnmounted(() => {
  window.removeEventListener('resize', window.__syncMobile)
  window.removeEventListener('orientationchange', window.__syncMobile)
})
</script>

<template>
  <router-view />
</template>

<style>
/* ==================== 主题色 ==================== */
:root {
  --el-color-primary: #1e88e5;
}

* {
  box-sizing: border-box;
}

html,
body,
#app {
  margin: 0;
  padding: 0;
  height: 100%;
}

body {
  font-family:
    'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ==================== Element Plus 全局响应式覆盖 ==================== */

/* 表格：窄屏容器允许横向滚动，内部列不再被强压缩 */
@media (max-width: 768px) {
  .el-table,
  .el-table__body-wrapper,
  .el-table__header-wrapper {
    min-width: 600px;
  }
}

/* 弹窗：窄屏占满视口，边距只留 12px */
@media (max-width: 768px) {
  .el-dialog {
    width: auto !important;
    max-width: calc(100vw - 24px) !important;
    margin: 12px auto !important;
    max-height: calc(100vh - 24px);
    overflow-y: auto;
  }
  .el-dialog__body {
    max-height: calc(100vh - 160px);
    overflow-y: auto;
  }
}

/* 卡片：窄屏内边距收窄 */
@media (max-width: 768px) {
  .el-card__body {
    padding: 12px;
  }
}

/* 表单：窄屏 inline 模式换行、label 不再占位太宽 */
@media (max-width: 768px) {
  .el-form--inline .el-form-item {
    display: flex;
    width: 100%;
    margin-right: 0 !important;
  }
  .el-form-item__label {
    min-width: 72px !important;
    padding-right: 8px !important;
    font-size: 13px;
  }
  .el-form-item__content {
    flex: 1;
    min-width: 0;
  }
  .el-col-12,
  .el-col-8,
  .el-col-6 {
    max-width: 100% !important;
    flex: 0 0 100% !important;
  }
}

/* 分页：窄屏简化，只保留总数/上一页/下一页 */
@media (max-width: 768px) {
  .el-pagination .el-pagination__sizes,
  .el-pagination .el-pagination__jump,
  .el-pagination .el-pagination__total {
    display: none !important;
  }
}

/* 下拉选择：窄屏展开层铺满宽度 */
@media (max-width: 768px) {
  .el-select-dropdown {
    min-width: calc(100vw - 24px) !important;
    max-width: calc(100vw - 24px) !important;
  }
}

/* el-message-box / el-dialog 强制居中（和 Layout.vue scoped 保持一致，无 scoped） */
.el-message-box,
.el-dialog {
  position: fixed !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  margin: 0 !important;
}
.el-overlay-message-box,
.el-overlay-dialog {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
}
</style>
