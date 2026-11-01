<script setup>
// 趋势分析页 —— 新增/关闭/超时 三维度趋势 + 同期对比 + 增长率卡
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { TrendCharts } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/store.js'
import { getStatsOverview, getStatsTrend, exportStats } from '@/api/tickets'
import { useLoading } from '@/composables/useLoading.js'
import BaseChart from '@/components/dataanalysis/BaseChart.vue'

const auth = useAuthStore()
const { loading, run } = useLoading()

const period = ref('month')
const exporting = ref(false)

const trend = ref({ current: [], previous: [] })
const overview = ref({ created: 0, closed: 0 })

const PERIOD_OPTIONS = [
  { value: 'day',    label: '今日' },
  { value: 'week',   label: '本周' },
  { value: 'month',  label: '本月' },
  { value: 'quarter', label: '本季度' },
  { value: 'year',   label: '本年' },
]

const roleScope = auth.isAdmin ? '全局' : auth.isLeader ? '本部门' : '个人'

// 汇总卡：本期 vs 同期 + 增长率
const summaryCards = computed(() => {
  const cur = trend.value.current
  const prev = trend.value.previous
  const curCreated = cur.reduce((s, b) => s + (b.created || 0), 0)
  const curClosed = cur.reduce((s, b) => s + (b.closed || 0), 0)
  const curBreached = cur.reduce((s, b) => s + (b.breached || 0), 0)
  const prevCreated = prev.reduce((s, b) => s + (b.created || 0), 0)
  const prevClosed = prev.reduce((s, b) => s + (b.closed || 0), 0)
  const prevBreached = prev.reduce((s, b) => s + (b.breached || 0), 0)

  const growth = (c, p) => p > 0 ? (((c - p) / p) * 100).toFixed(1) + '%' : c > 0 ? '新增' : '-'
  const growthColor = (c, p) => c > p ? '#67c23a' : c < p ? '#f56c6c' : '#909399'

  return [
    { label: '本期新增', value: curCreated, prev: prevCreated, growth: growth(curCreated, prevCreated), color: '#1e88e5', up: curCreated >= prevCreated },
    { label: '本期关闭', value: curClosed, prev: prevClosed, growth: growth(curClosed, prevClosed), color: '#67c23a', up: curClosed >= prevClosed },
    { label: '超时记录', value: curBreached, prev: prevBreached, growth: growth(curBreached, prevBreached), color: curBreached > prevBreached ? '#f56c6c' : '#67c23a', up: curBreached >= prevBreached },
  ]
})

// 三维度面积趋势（本期）
const areaOption = computed(() => {
  const cur = trend.value.current
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: 45, right: 20, top: 32, bottom: 40 },
    xAxis: { type: 'category', data: cur.map(b => b.bucket), boundaryGap: false },
    yAxis: { type: 'value' },
    series: [
      { name: '新增', type: 'line', data: cur.map(b => b.created), smooth: true,
        areaStyle: { opacity: 0.25, color: '#1e88e5' }, lineStyle: { width: 2, color: '#1e88e5' },
        itemStyle: { color: '#1e88e5' } },
      { name: '关闭', type: 'line', data: cur.map(b => b.closed), smooth: true,
        areaStyle: { opacity: 0.25, color: '#67c23a' }, lineStyle: { width: 2, color: '#67c23a' },
        itemStyle: { color: '#67c23a' } },
      { name: '超时', type: 'line', data: cur.map(b => b.breached), smooth: true,
        areaStyle: { opacity: 0.25, color: '#f56c6c' }, lineStyle: { width: 2, color: '#f56c6c' },
        itemStyle: { color: '#f56c6c' } },
    ],
  }
})

// 本期 vs 同期 双轴柱线混合
const compareOption = computed(() => {
  const cur = trend.value.current
  const prev = trend.value.previous
  const buckets = cur.map(b => b.bucket)
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: 50, right: 50, top: 32, bottom: 40 },
    xAxis: { type: 'category', data: buckets },
    yAxis: [
      { type: 'value', name: '本期', position: 'left', axisLine: { show: true, lineStyle: { color: '#1e88e5' } } },
      { type: 'value', name: '同期', position: 'right', axisLine: { show: true, lineStyle: { color: '#909399' } },
        splitLine: { show: false } },
    ],
    series: [
      { name: '本期新增', type: 'bar', data: cur.map(b => b.created), itemStyle: { color: '#1e88e5', borderRadius: [3, 3, 0, 0] }, yAxisIndex: 0 },
      { name: '同期新增', type: 'line', yAxisIndex: 1, data: prev.map(b => b.created), itemStyle: { color: '#909399' },
        lineStyle: { type: 'dashed' }, symbol: 'circle', symbolSize: 6 },
    ],
  }
})

async function load() {
  await run(async () => {
    try {
      const [t, o] = await Promise.all([
        getStatsTrend({ period: period.value }),
        getStatsOverview({ period: period.value }),
      ])
      trend.value = t
      overview.value = o
    } catch (e) { console.error('[StatsTrend] 加载失败:', e) }
  })
}

async function handleExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    const blob = await exportStats({ module: 'trend' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stats-trend-${new Date().toISOString().slice(0, 10)}.csv`
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
        <el-icon :size="22" color="#1e88e5"><TrendCharts /></el-icon>
        <span>趋势分析</span>
        <el-tag size="small" effect="plain">{{ roleScope }} · {{ PERIOD_OPTIONS.find(o => o.value === period)?.label }}</el-tag>
      </div>
      <div class="actions">
        <el-radio-group v-model="period" size="default">
          <el-radio-button v-for="o in PERIOD_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</el-radio-button>
        </el-radio-group>
        <el-button type="success" :loading="exporting" @click="handleExport">📥 导出 CSV</el-button>
      </div>
    </div>

    <!-- 增长率汇总 -->
    <el-row :gutter="16">
      <el-col v-for="c in summaryCards" :key="c.label" :xs="8" :md="8">
        <div class="summary-card" :style="{ borderLeftColor: c.color }">
          <div class="s-label">{{ c.label }}</div>
          <div class="s-value">{{ c.value }} <span class="s-growth" :style="{ color: c.up ? '#67c23a' : '#f56c6c' }">
            {{ c.up ? '↑' : '↓' }} {{ c.growth }}
          </span></div>
          <div class="s-prev">同期：{{ c.prev }}</div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="24">
        <el-card shadow="never" class="panel">
          <template #header>
            <span class="panel-title">本期趋势（新增 / 关闭 / 超时）</span>
          </template>
          <BaseChart v-if="trend.current?.length" :option="areaOption" height="300px" />
          <el-empty v-else description="暂无数据" :image-size="80" />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="24">
        <el-card shadow="never" class="panel">
          <template #header>
            <span class="panel-title">本期 vs 同期 双轴对比</span>
          </template>
          <BaseChart v-if="trend.current?.length" :option="compareOption" height="280px" />
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

.summary-card {
  background: #fff; border-radius: 10px; padding: 14px 18px;
  border-left: 4px solid #eee; box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
  margin-bottom: 12px;
}
.s-label { font-size: 13px; color: #606266; }
.s-value { font-size: 24px; font-weight: 600; color: #303133; margin-top: 4px; }
.s-growth { font-size: 13px; font-weight: 500; margin-left: 8px; }
.s-prev { font-size: 12px; color: #909399; margin-top: 2px; }

.panel { border-radius: 10px; border: none; box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06); }
.panel-title { font-size: 15px; font-weight: 600; color: #14487e; }
</style>
