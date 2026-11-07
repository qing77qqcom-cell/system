<script setup>
defineOptions({ name: 'SLASettings' })
/**
 * SLA 时效配置 —— tab 切换壳
 *   tab=rules    → SlaRuleList.vue（SLA 规则列表 + 新建/编辑弹窗）
 *   tab=events   → SlaEventList.vue（SLA 事件日志表格）
 *   tab=calendar → 占位（工作日历维护，后续补充）
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SlaRuleList from './SlaRuleList.vue'
import SlaEventList from './SlaEventList.vue'
import WorkCalendarList from './WorkCalendarList.vue'

const route = useRoute()
const router = useRouter()
const currentTab = computed(() => route.query.tab || 'rules')

const tabs = [
  { key: 'rules',    label: '⏱️ 时效规则列表',  desc: '按工单类型维护 SLA 时效规则，支持版本化发布' },
  { key: 'events',   label: '📜 SLA 事件日志',  desc: '查看所有 SLA 状态变更事件（预警/超时/完成）' },
  { key: 'calendar', label: '📅 工作日历',      desc: '配置工作日与节假日（后续补充）' },
]

function switchTab(tab) { router.push({ query: { ...route.query, tab } }) }
</script>

<template>
  <div class="sla-config">
    <div class="tab-bar">
      <div class="tab-tabs">
        <div
          v-for="t in tabs"
          :key="t.key"
          class="tab-item"
          :class="{ active: currentTab === t.key }"
          @click="switchTab(t.key)"
        >{{ t.label }}</div>
      </div>
      <div class="tab-desc">{{ tabs.find(t => t.key === currentTab)?.desc }}</div>
    </div>

    <SlaRuleList v-if="currentTab === 'rules'" />
    <SlaEventList v-else-if="currentTab === 'events'" />
    <WorkCalendarList v-else-if="currentTab === 'calendar'" />
  </div>
</template>

<style scoped>
.sla-config {
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

.tab-tabs { display: flex; gap: 0; }
.tab-item {
  padding: 14px 20px; cursor: pointer;
  font-size: 14px; color: #606266;
  border-bottom: 2px solid transparent;
  transition: all .2s; font-weight: 500;
}
.tab-item:hover { color: #409eff; }
.tab-item.active { color: #14487e; border-bottom-color: #14487e; font-weight: 600; }

.tab-desc { font-size: 12px; color: #909399; padding-bottom: 14px; }

.placeholder { border-radius: 8px; min-height: 400px; display: flex; align-items: center; }
.placeholder :deep(.el-empty) { margin: auto; }
</style>
