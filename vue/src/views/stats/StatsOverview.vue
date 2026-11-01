<script setup>
// 工单总览页 —— 6 张指标卡 + 状态分布饼图 + 趋势柱图
// 后端：GET /api/stats/overview + /status-distribution + /trend
import { computed, onMounted, ref, watch, h } from 'vue'
import { ElMessage } from 'element-plus'
import { DataAnalysis } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/store.js'
import { getStatsOverview, getStatsStatusDistribution, getStatsTrend, exportStats } from '@/api/tickets'
import { useLoading } from '@/composables/useLoading.js'
import BaseChart from '@/components/dataanalysis/BaseChart.vue'
import StatusPieChart from '@/components/dataanalysis/StatusPieChart.vue'

const auth = useAuthStore()
const { loading, run } = useLoading()

const period = ref('month')
const exporting = ref(false)

const overview = ref({ total: 0, created: 0, closed: 0, unclosed: 0, cancelled: 0, rejected: 0 })
const distribution = ref({ list: [], overdueOpen: 0 })
const trend = ref({ current: [], previous: [] })

const roleScope = auth.isAdmin ? '全局' : auth.isLeader ? '本部门' : '个人'

const PERIOD_OPTIONS = [
  { value: 'day',    label: '今日' },
  { value: 'week',   label: '本周' },
  { value: 'month',  label: '本月' },
  { value: 'quarter', label: '本季度' },
  { value: 'year',   label: '本年' },
]

// 指标卡（admin 全 6 张；leader/staff 去掉 cancelled/rejected）
const metricCards = computed(() => {
  const cards = [
    { label: `${roleScope}工单总数`, value: overview.value.total, color: '#1e88e5', icon: '📊' },
    { label: '周期内新增', value: overview.value.created, color: '#42a5f5', icon: '📥' },
    { label: '未完结工单', value: overview.value.unclosed, color: '#e6a23c', icon: '⏳' },
    { label: '周期内已关闭', value: overview.value.closed, color: '#67c23a', icon: '✅' },
  ]
  if (auth.isAdmin || auth.isLeader) {
    cards.push({ label: '已取消', value: overview.value.cancelled, color: '#909399', icon: '🚫' })
    cards.push({ label: '审批驳回', value: overview.value.rejected, color: '#f56c6c', icon: '❌' })
  }
  return cards
})

// 趋势组合柱+线图 option
const trendOption = computed(() => {
  const buckets = trend.value.current.map((b) => b.bucket)
  const map = (arr, key) => arr.map((b) => b[key] ?? 0)
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: 45, right: 20, top: 32, bottom: 40 },
    xAxis: {
      type: 'category',
      data: buckets,
      axisLabel: { rotate: buckets.length > 8 ? 40 : 0 },
    },
    yAxis: { type: 'value' },
    series: [
      { name: '本期新增', type: 'bar', data: map(trend.value.current, 'created'),
        itemStyle: { color: '#1e88e5', borderRadius: [4, 4, 0, 0] }, barWidth: '22%' },
      { name: '本期关闭', type: 'bar', data: map(trend.value.current, 'closed'),
        itemStyle: { color: '#67c23a', borderRadius: [4, 4, 0, 0] }, barWidth: '22%' },
      { name: '同期新增', type: 'line', data: map(trend.value.previous, 'created'),
        itemStyle: { color: '#909399' }, lineStyle: { type: 'dashed', width: 2 },
        symbol: 'circle', symbolSize: 5 },
      { name: '同期关闭', type: 'line', data: map(trend.value.previous, 'closed'),
        itemStyle: { color: '#67c23a' }, lineStyle: { type: 'dashed', width: 2 },
        symbol: 'circle', symbolSize: 5 },
    ],
  }
})

async function load() {
  await run(async () => {
    try {
      const [o, d, t] = await Promise.all([
        getStatsOverview({ period: period.value }),
        getStatsStatusDistribution({ period: period.value }),
        getStatsTrend({ period: period.value }),
      ])
      overview.value = o
      distribution.value = d
      trend.value = t
    } catch (e) {
      console.error('[StatsOverview] 加载失败:', e)
    }
  })
}

async function handleExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    const blob = await exportStats({ module: 'overview' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stats-overview-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    ElMessage.success('导出完成')
  } catch (e) {
    ElMessage.error('导出失败：' + (e?.message || e))
  } finally {
    exporting.value = false
  }
}

onMounted(load)
watch(period, load)
</script>

<template>
  <div class="stats-page" v-loading="loading">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="title">
        <el-icon :size="22" color="#1e88e5"><DataAnalysis /></el-icon>
        <span>工单总览</span>
        <el-tag size="small" effect="plain">{{ roleScope }} · {{ PERIOD_OPTIONS.find(o => o.value === period)?.label }}</el-tag>
      </div>
      <div class="actions">
        <el-radio-group v-model="period" size="default">
          <el-radio-button v-for="o in PERIOD_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</el-radio-button>
        </el-radio-group>
        <el-button type="success" :loading="exporting" @click="handleExport">📥 导出 CSV</el-button>
      </div>
    </div>

    <!-- 指标卡 -->
    <el-row :gutter="16" class="metric-row">
      <el-col v-for="m in metricCards" :key="m.label" :xs="12" :sm="8" :md="6">
        <div class="metric-card" :style="{ borderTopColor: m.color }">
          <div class="metric-top">
            <span class="metric-label">{{ m.label }}</span>
            <span class="metric-icon">{{ m.icon }}</span>
          </div>
          <div class="metric-value" :style="{ color: m.color }">{{ m.value }}</div>
        </div>
      </el-col>
    </el-row>

    <!-- 图表 -->
    <el-row :gutter="16">
      <el-col :span="10">
        <el-card shadow="never" class="panel">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">工单状态分布</span>
              <el-tag v-if="distribution.overdueOpen" type="danger" effect="dark" round>
                超时未完结 {{ distribution.overdueOpen }} 单
              </el-tag>
            </div>
          </template>
          <StatusPieChart v-if="distribution.list?.length" :list="distribution.list" height="320px" />
          <el-empty v-else description="暂无数据" :image-size="80" />
        </el-card>
      </el-col>

      <el-col :span="14">
        <el-card shadow="never" class="panel">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">工单趋势（本期 vs 同期）</span>
            </div>
          </template>
          <BaseChart v-if="trend.current?.length" :option="trendOption" height="320px" />
          <el-empty v-else description="暂无数据" :image-size="80" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.stats-page { display: flex; flex-direction: column; gap: 16px; }

.toolbar {
  display: flex; align-items: center; justify-content: space-between;
  background: #fff; border-radius: 10px; padding: 12px 18px;
  box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
}
.title { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 600; color: #14487e; }
.actions { display: flex; align-items: center; gap: 12px; }

.metric-row { margin-bottom: 0; }
.metric-card {
  background: #fff; border-radius: 10px; padding: 16px 18px;
  border-top: 3px solid #eee; box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
  margin-bottom: 12px;
}
.metric-top { display: flex; justify-content: space-between; align-items: center; }
.metric-label { font-size: 13px; color: #606266; }
.metric-icon { font-size: 20px; }
.metric-value { font-size: 28px; font-weight: 600; margin-top: 6px; }

.panel { border-radius: 10px; border: none; box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06); }
.panel-header { display: flex; align-items: center; justify-content: space-between; }
.panel-title { font-size: 15px; font-weight: 600; color: #14487e; }
</style>
