<script setup>
// 状态筛选侧边菜单：两个入口复用
// - /work-orders             → basePath = '/work-orders'
// - /workbench/workorderlist → basePath = '/workbench/workorderlist'
// 高亮靠调用方传 activeIndex（因为 query 匹配逻辑在 WorkOrderList 里）
import { computed } from 'vue'
import { List } from '@element-plus/icons-vue'

const props = defineProps({
  basePath: { type: String, required: true },
  activeIndex: { type: String, default: '' },
})

// 6 个状态筛选项（index = basePath + ?status=xxx，router 模式下自动跳转）
const menuItems = computed(() => [
  { title: '已提交', index: props.basePath,                               status: '' },
  { title: '待处理', index: `${props.basePath}?status=pending_processing`, status: 'pending_processing' },
  { title: '处理中', index: `${props.basePath}?status=processing`,         status: 'processing' },
  { title: '已完成', index: `${props.basePath}?status=pending_confirmation`, status: 'pending_confirmation' },
  { title: '已关闭', index: `${props.basePath}?status=closed`,           status: 'closed' },
  { title: '已退回', index: `${props.basePath}?status=pending_approval`, status: 'pending_approval' },
])
</script>

<template>
  <el-menu :default-active="activeIndex" router class="sub-aside">
    <el-menu-item
      v-for="m in menuItems"
      :key="m.index"
      :index="m.index"
    >
      <el-icon><List /></el-icon>
      <template #title>{{ m.title }}</template>
    </el-menu-item>
  </el-menu>
</template>

<style scoped>
.sub-aside {
  width: 180px;
  flex-shrink: 0;
  background: #fff;
  border-radius: 8px;
  border-right: none;
  box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
}
.sub-aside :deep(.el-menu-item.is-active) {
  background: #eaf4fe;
  color: #1e88e5;
}
.sub-aside :deep(.el-menu-item) {
  gap: 6px;
}
</style>
