<script setup>
defineOptions({ name: 'ApprovalFlow' })
/**
 * 审批流程配置 —— tab 切换壳
 *
 * 菜单已有两个三级入口：
 *   /systemcontrol/approval-flow?tab=list   → 流程列表（FlowList.vue）
 *   /systemcontrol/approval-flow?tab=editor → 流程编辑器（本文件原有逻辑）
 *
 * 默认 tab=list；从列表页点"编辑"传 query.ticketType 进编辑器。
 */
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import FlowList from '@/views/FlowList.vue'
import ApprovalFlowEditorInner from './ApprovalFlowEditorInner.vue'

const route = useRoute()
const router = useRouter()

const currentTab = computed(() => route.query.tab || 'list')
const ticketTypeFromQuery = computed(() => route.query.ticketType || '')

// tab 切换 → 改 query（而不是 v-if 切组件，这样 tab 切换时组件不销毁、状态保留）
function switchTab(tab) {
  const q = { ...route.query, tab }
  // 切回 list 时清掉 ticketType，避免下次进 editor 还带着
  if (tab === 'list') delete q.ticketType
  router.push({ query: q })
}
</script>

<template>
  <div class="flow-editor-shell">
    <!-- Tab 切换 -->
    <div class="tab-bar">
      <div class="tab-tabs">
        <div
          class="tab-item"
          :class="{ active: currentTab === 'list' }"
          @click="switchTab('list')"
        >📋 流程列表</div>
        <div
          class="tab-item"
          :class="{ active: currentTab === 'editor' }"
          @click="switchTab('editor')"
        >🎨 流程编辑器</div>
      </div>
      <div class="tab-desc">
        <span v-if="currentTab === 'list'">查看、启停、删除各工单类型的审批流程</span>
        <span v-else>拖拽节点到画布，配置审批人策略，保存即生效</span>
      </div>
    </div>

    <!-- tab=list 流程列表 -->
    <FlowList v-if="currentTab === 'list'" />

    <!-- tab=editor 编辑器（query 带 ticketType 时自动选中） -->
    <ApprovalFlowEditorInner v-else :initial-ticket-type="ticketTypeFromQuery" />
  </div>
</template>

<style scoped>
.flow-editor-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 620px;
}

.tab-bar {
  background: #fff;
  border-radius: 8px;
  padding: 0 20px;
  border: 1px solid #e6eef7;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.tab-tabs {
  display: flex;
  gap: 0;
}

.tab-item {
  padding: 14px 20px;
  cursor: pointer;
  font-size: 14px;
  color: #606266;
  border-bottom: 2px solid transparent;
  transition: all .2s;
  font-weight: 500;
}
.tab-item:hover { color: #409eff; }
.tab-item.active {
  color: #14487e;
  border-bottom-color: #14487e;
  font-weight: 600;
}

.tab-desc {
  font-size: 12px;
  color: #909399;
  padding-bottom: 14px;
}
</style>
