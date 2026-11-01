<script setup>
// 部门排行 / 工作量页 —— 人员工作量条形 + 人均卡 + 详情表
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { DataLine } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/store.js'
import { getStatsWorkload, exportStats } from '@/api/tickets'
import { useLoading } from '@/composables/useLoading.js'
import BaseChart from '@/components/dataanalysis/BaseChart.vue'

const auth = useAuthStore()
const { loading, run } = useLoading()

const period = ref('month')
const exporting = ref(false)

const workload = ref({ list: [], avgPerPerson: 0 })

const PERIOD_OPTIONS = [
  { value: 'week',   label: '本周' },
  { value: 'month',  label: '本月' },
  { value: 'quarter', label: '本季度' },
  { value: 'year',   label: '本年' },
]
const roleScope = auth.isAdmin ? '全局' : auth.isLeader ? '本部门' : '个人'

// 汇总
const totals = computed(() => {
  const list = workload.value.list
  const sum = (k) => list.reduce((s, r) => s + (r[k] || 0), 0)
  return {
    accepted: sum('accepted'),
    processed: sum('processed'),
    closed: sum('closed'),
    rejected: sum('rejected'),
    cancelled: sum('cancelled'),
  }
})

// 人员工作量水平条形（按 closed 排序）
const workloadBarOption = computed(() => {
  const sorted = [...workload.value.list].sort((a, b) =>
    (b.accepted + b.processed + b.closed) - (a.accepted + a.processed + a.closed)
  )
  const names = sorted.map(r => r.name).reverse()
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, data: ['接单', '处理', '完结', '驳回', '取消'] },
    grid: { left: 70, right: 20, top: 34, bottom: 20 },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: names },
    series: [
      { name: '接单', type: 'bar', stack: 'a', data: sorted.map(r => r.accepted).reverse(), itemStyle: { color: '#1e88e5' } },
      { name: '处理', type: 'bar', stack: 'a', data: sorted.map(r => r.processed).reverse(), itemStyle: { color: '#42a5f5' } },
      { name: '完结', type: 'bar', stack: 'a', data: sorted.map(r => r.closed).reverse(), itemStyle: { color: '#67c23a' } },
      { name: '驳回', type: 'bar', stack: 'a', data: sorted.map(r => r.rejected).reverse(), itemStyle: { color: '#f56c6c' } },
      { name: '取消', type: 'bar', stack: 'a', data: sorted.map(r => r.cancelled).reverse(), itemStyle: { color: '#909399' } },
    ],
  }
})

// 汇总卡
const summaryCards = computed(() => [
  { label: '接单合计', value: totals.value.accepted, color: '#1e88e5' },
  { label: '处理合计', value: totals.value.processed, color: '#42a5f5' },
  { label: '完结合计', value: totals.value.closed, color: '#67c23a' },
  { label: '人均处理', value: workload.value.avgPerPerson || 0, color: '#e6a23c' },
])

async function load() {
  await run(async () => {
    try {
      workload.value = await getStatsWorkload({ period: period.value })
    } catch (e) { console.error('[StatsWorkload] 加载失败:', e) }
  })
}

async function handleExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    const blob = await exportStats({ module: 'workload' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stats-workload-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    ElMessage.success('导出完成')
  } catch (e) { ElMessage.error('导出失败：' + (e?.message || e)) }
  finally { exporting.value = false }
}

onMounted(load)
watch(period, load)
</script>

<template>
  <div class="stats-page" v-loading="loading">
    <div class="toolbar">
      <div class="title">
        <el-icon :size="22" color="#1e88e5"><DataLine /></el-icon>
        <span>{{ auth.isAdmin ? '部门排行' : '工作量统计' }}</span>
        <el-tag size="small" effect="plain">{{ roleScope }} · {{ PERIOD_OPTIONS.find(o => o.value === period)?.label }}</el-tag>
        <el-tag v-if="workload.list.length" effect="dark" round>共 {{ workload.list.length }} 人</el-tag>
      </div>
      <div class="actions">
        <el-radio-group v-model="period" size="default">
          <el-radio-button v-for="o in PERIOD_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</el-radio-button>
        </el-radio-group>
        <el-button type="success" :loading="exporting" @click="handleExport">📥 导出 CSV</el-button>
      </div>
    </div>

    <el-row :gutter="16">
      <el-col v-for="c in summaryCards" :key="c.label" :xs="12" :sm="6">
        <div class="summary-card" :style="{ borderTopColor: c.color }">
          <div class="s-label">{{ c.label }}</div>
          <div class="s-value" :style="{ color: c.color }">{{ c.value }}</div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="14">
        <el-card shadow="never" class="panel">
          <template #header><span class="panel-title">人员工作量堆叠条形图</span></template>
          <BaseChart v-if="workload.list?.length" :option="workloadBarOption" height="340px" />
          <el-empty v-else description="暂无数据" :image-size="80" />
        </el-card>
      </el-col>

      <el-col :span="10">
        <el-card shadow="never" class="panel">
          <template #header><span class="panel-title">工作量详情表</span></template>
          <el-table :data="workload.list" stripe size="default" max-height="340" :show-header="true">
            <el-table-column prop="name" label="姓名" width="90" />
            <el-table-column prop="accepted" label="接单" width="70" align="center" />
            <el-table-column prop="processed" label="处理" width="70" align="center" />
            <el-table-column prop="closed" label="完结" width="70" align="center" />
            <el-table-column label="合计" width="70" align="center">
              <template #default="{ row }">
                <b>{{ row.accepted + row.processed + row.closed + row.rejected + row.cancelled }}</b>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.stats-page { display: flex; flex-direction: column; gap: 16px; }
.toolbar {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;
  background: #fff; border-radius: 10px; padding: 12px 18px;
  box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
}
.title { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 600; color: #14487e; flex-wrap: wrap; }
.actions { display: flex; align-items: center; gap: 12px; }

.summary-card {
  background: #fff; border-radius: 10px; padding: 14px 18px;
  border-top: 3px solid #eee; box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
  margin-bottom: 12px;
}
.s-label { font-size: 13px; color: #606266; }
.s-value { font-size: 26px; font-weight: 600; margin-top: 4px; }

.panel { border-radius: 10px; border: none; box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06); }
.panel-title { font-size: 15px; font-weight: 600; color: #14487e; }
</style>
