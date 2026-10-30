<script setup>
// 数据分析子页面：快捷指标卡 + 4 个 ECharts 图表
import { computed, onMounted, ref } from 'vue'
import {
  getStatsOverview, getStatsStatusDistribution, getStatsSla, getStatsTrend,
} from '@/api/tickets'
import { useAuthStore } from '@/stores/store.js'
import { useLoading } from '@/composables/useLoading.js'
import StatusPieChart from '@/components/dataanalysis/StatusPieChart.vue'
import TrendBarChart from '@/components/dataanalysis/TrendBarChart.vue'
import SlaRateChart from '@/components/dataanalysis/SlaRateChart.vue'
import SlaRingChart from '@/components/dataanalysis/SlaRingChart.vue'

const auth = useAuthStore()
const { loading, run } = useLoading()
const isAdmin = auth.isAdmin
const isLeader = auth.isLeader
const roleScope = isAdmin ? '全局' : isLeader ? '本部门' : '个人'

// ------ 数据 ------
const overview = ref({ total: 0, created: 0, closed: 0, unclosed: 0, cancelled: 0, rejected: 0 })
const distribution = ref({ list: [], overdueOpen: 0 })
const sla = ref({ overallRate: 0, responseRate: 0, approvalRate: 0, processingRate: 0, breachedCount: 0, avgBreachedDuration: 0 })
const trend = ref({ current: [], previous: [] })

// 快捷指标卡
const metricCards = computed(() => [
  { label: `${roleScope}工单总数`, value: overview.value.total, color: '#1e88e5' },
  { label: '本周期新增', value: overview.value.created, color: '#42a5f5' },
  { label: '未完结工单', value: overview.value.unclosed, color: '#e6a23c' },
  { label: '周期内已关闭', value: overview.value.closed, color: '#67c23a' },
  { label: '已取消', value: overview.value.cancelled, color: '#909399' },
  { label: '审批驳回', value: overview.value.rejected, color: '#f56c6c' },
])

// 格式化毫秒 → h/m 文本
const fmtMs = (ms) => {
  if (!ms) return '0 分钟'
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return mm ? `${h} 小时 ${mm} 分` : `${h} 小时`
}

onMounted(async () => {
  await run(async () => {
    try {
      const [overviewData, distData, slaData, trendData] = await Promise.all([
        getStatsOverview(),
        getStatsStatusDistribution(),
        getStatsSla(),
        getStatsTrend(),
      ])
      overview.value = overviewData
      distribution.value = distData
      sla.value = slaData
      trend.value = trendData
    } catch (e) {
      console.error('[DataList] 加载失败:', e)
    }
  })
})
</script>

<template>
  <div class="data-analysis" v-loading="loading">
    <!-- 快捷指标卡 -->
    <el-row :gutter="16" class="metric-row">
      <el-col v-for="m in metricCards" :key="m.label" :xs="12" :sm="8" :md="4">
        <div class="metric-card" :style="{ borderTopColor: m.color }">
          <div class="metric-label">{{ m.label }}</div>
          <div class="metric-value" :style="{ color: m.color }">{{ m.value }}</div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <!-- 左侧 主图表区 -->
      <el-col :span="isAdmin || isLeader ? 16 : 24">
        <!-- 状态分布饼图 -->
        <el-card shadow="never" class="panel">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">工单状态总览（{{ roleScope }}）</span>
              <el-tag v-if="distribution.overdueOpen" type="danger" effect="dark" round>
                超时未完结 {{ distribution.overdueOpen }} 单
              </el-tag>
            </div>
          </template>
          <StatusPieChart v-if="distribution.list.length" :list="distribution.list" height="300px" />
          <el-empty v-else description="暂无数据" :image-size="80" />
        </el-card>

        <!-- 趋势柱图 -->
        <el-card shadow="never" class="panel">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">工单趋势（本期 vs 同期）</span>
            </div>
          </template>
          <TrendBarChart v-if="trend.current.length" :current="trend.current" :previous="trend.previous" height="280px" />
          <el-empty v-else description="暂无数据" :image-size="80" />
        </el-card>

        <!-- SLA 各指标超时率（仅 admin / leader 可见） -->
        <el-card v-if="isAdmin || isLeader" shadow="never" class="panel">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">SLA 超时率（按指标拆分）</span>
              <el-tag type="warning" effect="plain">
                超时单 {{ sla.breachedCount }} · 平均超时 {{ fmtMs(sla.avgBreachedDuration) }}
              </el-tag>
            </div>
          </template>
          <SlaRateChart v-if="sla.overallRate !== undefined" :sla="sla" height="220px" />
        </el-card>
      </el-col>

      <!-- 右侧 侧栏区（admin/leader 专属） -->
      <el-col v-if="isAdmin || isLeader" :span="8">
        <!-- SLA 达标率环形 -->
        <el-card shadow="never" class="panel">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">整体 SLA 达标率</span>
            </div>
          </template>
          <SlaRingChart :overallRate="sla.overallRate" height="200px" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.metric-row { margin-bottom: 0; }
.metric-card {
  background: #fff;
  border-radius: 10px;
  padding: 16px 18px;
  border-top: 3px solid #eee;
  box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
  margin-bottom: 12px;
}
.metric-label { font-size: 13px; color: #606266; }
.metric-value { font-size: 28px; font-weight: 600; margin-top: 4px; }

.panel {
  margin-top: 16px;
  border-radius: 10px;
  border: none;
  box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
}
.panel-header { display: flex; align-items: center; justify-content: space-between; }
.panel-title { font-size: 16px; font-weight: 600; color: #14487e; }
</style>
