<script setup>
// 状态分布页 —— 10 态饼图 + 状态条形排名 + 工单列表筛选
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { PieChart } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/store.js'
import { getStatsStatusDistribution, exportStats } from '@/api/tickets'
import { useLoading } from '@/composables/useLoading.js'
import BaseChart from '@/components/dataanalysis/BaseChart.vue'
import { STATUS_TEXT, STATUS_TAG_TYPE } from '@/constants'

const auth = useAuthStore()
const { loading, run } = useLoading()

const period = ref('month')
const exporting = ref(false)

const distribution = ref({ list: [], overdueOpen: 0 })

const PERIOD_OPTIONS = [
  { value: 'week',   label: '本周' },
  { value: 'month',  label: '本月' },
  { value: 'quarter', label: '本季度' },
  { value: 'year',   label: '本年' },
]
const roleScope = auth.isAdmin ? '全局' : auth.isLeader ? '本部门' : '个人'

const TAG_COLOR = { primary: '#1e88e5', success: '#67c23a', warning: '#e6a23c', danger: '#f56c6c', info: '#909399' }

// 饼图 option
const pieOption = computed(() => ({
  tooltip: { trigger: 'item', formatter: '{b}：{c} 条（{d}%）' },
  legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8 },
  series: [{
    name: '工单状态',
    type: 'pie',
    radius: ['38%', '65%'],
    center: ['50%', '42%'],
    itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
    label: { show: true, formatter: '{b}\n{d}%', fontSize: 11 },
    labelLine: { length: 8, length2: 6 },
    data: distribution.value.list
      .filter(s => s.count > 0)
      .map((s) => ({
        name: STATUS_TEXT[s.status] ?? s.status,
        value: s.count,
        itemStyle: { color: TAG_COLOR[STATUS_TAG_TYPE[s.status]] ?? '#909399' },
      })),
  }],
}))

// 状态条形排名（横向柱，按 count 排序）
const barOption = computed(() => {
  const sorted = [...distribution.value.list].sort((a, b) => b.count - a.count).filter(s => s.count > 0)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: '{b}：{c} 条' },
    grid: { left: 110, right: 20, top: 10, bottom: 20 },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: sorted.map(s => STATUS_TEXT[s.status] ?? s.status).reverse() },
    series: [{
      type: 'bar',
      data: sorted.reverse().map((s) => ({
        value: s.count,
        itemStyle: { color: TAG_COLOR[STATUS_TAG_TYPE[s.status]] ?? '#909399', borderRadius: [0, 4, 4, 0] },
      })),
      barWidth: 18,
      label: { show: true, position: 'right', formatter: '{c}' },
    }],
  }
})

// 状态明细表（全 10 态含 0）
const statusRows = computed(() => {
  const total = distribution.value.list.reduce((s, r) => s + r.count, 0)
  return distribution.value.list.map(s => ({
    ...s,
    label: STATUS_TEXT[s.status] ?? s.status,
    ratioPct: (s.ratio * 100).toFixed(1) + '%',
  }))
})

async function load() {
  await run(async () => {
    try {
      const d = await getStatsStatusDistribution({ period: period.value })
      distribution.value = d
    } catch (e) { console.error('[StatsStatus] 加载失败:', e) }
  })
}

async function handleExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    const blob = await exportStats({ module: 'status' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stats-status-${new Date().toISOString().slice(0, 10)}.csv`
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
        <el-icon :size="22" color="#1e88e5"><PieChart /></el-icon>
        <span>状态分布</span>
        <el-tag size="small" effect="plain">{{ roleScope }} · {{ PERIOD_OPTIONS.find(o => o.value === period)?.label }}</el-tag>
        <el-tag v-if="distribution.overdueOpen" type="danger" effect="dark" round>
          🔥 超时未完结 {{ distribution.overdueOpen }} 单
        </el-tag>
      </div>
      <div class="actions">
        <el-radio-group v-model="period" size="default">
          <el-radio-button v-for="o in PERIOD_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</el-radio-button>
        </el-radio-group>
        <el-button type="success" :loading="exporting" @click="handleExport">📥 导出 CSV</el-button>
      </div>
    </div>

    <el-row :gutter="16">
      <el-col :span="10">
        <el-card shadow="never" class="panel">
          <template #header><span class="panel-title">状态占比饼图</span></template>
          <BaseChart v-if="distribution.list?.some(s => s.count > 0)" :option="pieOption" height="340px" />
          <el-empty v-else description="暂无数据" :image-size="80" />
        </el-card>
      </el-col>

      <el-col :span="14">
        <el-card shadow="never" class="panel">
          <template #header><span class="panel-title">状态数量排名</span></template>
          <BaseChart v-if="distribution.list?.some(s => s.count > 0)" :option="barOption" height="340px" />
          <el-empty v-else description="暂无数据" :image-size="80" />
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="panel">
      <template #header><span class="panel-title">状态明细表（全部 10 态）</span></template>
      <el-table :data="statusRows" stripe size="default" max-height="300">
        <el-table-column label="状态" min-width="140">
          <template #default="{ row }">
            <el-tag :type="STATUS_TAG_TYPE[row.status]" size="small">{{ row.label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="count" label="数量" width="100" align="center" sortable />
        <el-table-column label="占比" width="120" align="center">
          <template #default="{ row }">
            <div style="display:flex;align-items:center;gap:8px;">
              <el-progress :percentage="Number(row.ratioPct.replace('%', ''))" :stroke-width="12"
                :show-text="false" :color="TAG_COLOR[STATUS_TAG_TYPE[row.status]]" style="flex:1" />
              <span style="font-size:12px;color:#606266;width:44px;text-align:right;">{{ row.ratioPct }}</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
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
.panel { border-radius: 10px; border: none; box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06); }
.panel-title { font-size: 15px; font-weight: 600; color: #14487e; }
</style>
