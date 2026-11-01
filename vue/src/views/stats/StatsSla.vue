<script setup>
// SLA 时效页 —— 达标率仪表盘 + 各指标超时率 + 超时明细表
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Timer } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/store.js'
import { getStatsSla, getStatsSlaDetails, exportStats } from '@/api/tickets'
import { useLoading } from '@/composables/useLoading.js'
import BaseChart from '@/components/dataanalysis/BaseChart.vue'

const auth = useAuthStore()
const { loading, run } = useLoading()

const period = ref('month')
const exporting = ref(false)

const sla = ref({ overallRate: 0, responseRate: 0, approvalRate: 0, processingRate: 0, breachedCount: 0, avgBreachedDuration: 0 })
const details = ref([])

const PERIOD_OPTIONS = [
  { value: 'week',   label: '本周' },
  { value: 'month',  label: '本月' },
  { value: 'quarter', label: '本季度' },
  { value: 'year',   label: '本年' },
]
const roleScope = auth.isAdmin ? '全局' : auth.isLeader ? '本部门' : '个人'

const fmtMs = (ms) => {
  if (!ms) return '0 分钟'
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return mm ? `${h} 小时 ${mm} 分` : `${h} 小时`
}

// 仪表盘 option
const gaugeOption = computed(() => ({
  tooltip: { formatter: '{b}：{c}%' },
  series: [{
    type: 'gauge',
    radius: '90%',
    startAngle: 210,
    endAngle: -30,
    progress: { show: true, width: 18 },
    axisLine: { lineStyle: { width: 18, color: [
      [0.95, '#f56c6c'], [0.98, '#e6a23c'], [1, '#67c23a'],
    ] } },
    pointer: { show: false },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { show: false },
    detail: {
      formatter: (() => {
        const rate = sla.value.overallRate
        return `${Math.max(0, (100 - rate)).toFixed(1)}%`
      })(),
      offsetCenter: [0, '5%'],
      fontSize: 28,
      fontWeight: 700,
      color: sla.value.overallRate > 5 ? '#f56c6c' : sla.value.overallRate > 2 ? '#e6a23c' : '#67c23a',
    },
    title: { show: true, offsetCenter: [0, '38%'], fontSize: 14, color: '#a3b5c7' },
    data: [{ value: 100 - sla.value.overallRate, name: '整体 SLA 达标率' }],
  }],
}))

// 各指标超时率水平条形
const barOption = computed(() => {
  const ROWS = [
    { k: 'overallRate', label: '总体' },
    { k: 'responseRate', label: '首次响应' },
    { k: 'approvalRate', label: '审批' },
    { k: 'processingRate', label: '处理' },
  ]
  return {
    tooltip: { trigger: 'axis', formatter: '{b} 超时率：{c}%' },
    grid: { left: 80, right: 30, top: 10, bottom: 20 },
    xAxis: { type: 'value', max: 10, axisLabel: { formatter: '{value}%' } },
    yAxis: { type: 'category', data: ROWS.map(r => r.label).reverse() },
    series: [{
      type: 'bar',
      data: ROWS.map(r => ({
        value: sla.value[r.k],
        itemStyle: {
          color: sla.value[r.k] > 5 ? '#f56c6c' : sla.value[r.k] > 2 ? '#e6a23c' : '#67c23a',
          borderRadius: [0, 4, 4, 0],
        },
      })).reverse(),
      barWidth: 22,
      label: { show: true, position: 'right', formatter: '{c}%' },
    }],
  }
})

// 汇总指标卡
const summaryCards = computed(() => [
  { label: '超时记录数', value: sla.value.breachedCount, color: '#f56c6c' },
  { label: '平均超时时长', value: fmtMs(sla.value.avgBreachedDuration), color: '#e6a23c' },
  { label: '整体超时率', value: sla.value.overallRate.toFixed(1) + '%', color: sla.value.overallRate > 5 ? '#f56c6c' : sla.value.overallRate > 2 ? '#e6a23c' : '#67c23a' },
  { label: 'SLA 达标率', value: (100 - sla.value.overallRate).toFixed(1) + '%', color: '#67c23a' },
])

async function load() {
  await run(async () => {
    try {
      const [s, d] = await Promise.all([
        getStatsSla({ period: period.value }),
        auth.isAdmin || auth.isLeader ? getStatsSlaDetails({ period: period.value }) : Promise.resolve([]),
      ])
      sla.value = s
      details.value = d
    } catch (e) { console.error('[StatsSla] 加载失败:', e) }
  })
}

async function handleExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    const blob = await exportStats({ module: 'sla' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stats-sla-${new Date().toISOString().slice(0, 10)}.csv`
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
        <el-icon :size="22" color="#1e88e5"><Timer /></el-icon>
        <span>SLA 时效</span>
        <el-tag size="small" effect="plain">{{ roleScope }} · {{ PERIOD_OPTIONS.find(o => o.value === period)?.label }}</el-tag>
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
      <el-col :span="8">
        <el-card shadow="never" class="panel">
          <template #header><span class="panel-title">整体 SLA 达标率</span></template>
          <BaseChart :option="gaugeOption" height="280px" />
        </el-card>
      </el-col>

      <el-col :span="16">
        <el-card shadow="never" class="panel">
          <template #header>
            <span class="panel-title">各指标超时率</span>
            <el-tag type="warning" effect="plain" size="small">红色 > 5% · 黄色 > 2%</el-tag>
          </template>
          <BaseChart :option="barOption" height="280px" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 超时工单明细表（admin/leader 可见） -->
    <el-card v-if="(auth.isAdmin || auth.isLeader) && details.length" shadow="never" class="panel">
      <template #header>
        <span class="panel-title">超时工单明细</span>
        <el-tag type="danger" effect="dark" round>共 {{ details.length }} 条</el-tag>
      </template>
      <el-table :data="details" stripe max-height="320" size="default">
        <el-table-column prop="ticketId" label="工单ID" width="90" align="center" />
        <el-table-column prop="title" label="工单标题" min-width="200" show-overflow-tooltip />
        <el-table-column label="指标" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.metricType === 'overall' ? 'danger' : 'warning'" size="small">{{ row.metricType }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="handlerName" label="当前处理人" width="120" />
        <el-table-column label="超时" width="120" align="right">
          <template #default="{ row }">
            <span style="color:#f56c6c;font-weight:600;">{{ fmtMs(row.breachedDuration) }}</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
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
  border-top: 3px solid #eee; box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
  margin-bottom: 12px;
}
.s-label { font-size: 13px; color: #606266; }
.s-value { font-size: 26px; font-weight: 700; margin-top: 4px; }

.panel { border-radius: 10px; border: none; box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06); }
.panel-title { font-size: 15px; font-weight: 600; color: #14487e; }
</style>
