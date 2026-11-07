<script setup>
/**
 * SLA 事件日志（tab=events 时渲染）
 *
 * 后端 API：GET /api/sla-events?ticket_id=&event_type=&sla_status=&limit=&offset=
 * 返回：{ total, list, page, pageSize }
 */
import { ref, reactive, computed, onMounted } from 'vue'
import request from '@/utils/request.js'

const PAGE_SIZE = 50
const loading = ref(false)
const rows = ref([])
const total = ref(0)
const currentPage = ref(1)

const filter = reactive({
  ticketId: '',
  eventType: '',
  slaStatus: '',
})

const EVENT_TYPE_OPTIONS = [
  { value: 'sla_created',            label: '创建',    color: '#909399' },
  { value: 'sla_started',            label: '启动',    color: '#409eff' },
  { value: 'sla_paused',             label: '暂停',    color: '#e6a23c' },
  { value: 'sla_resumed',            label: '恢复',    color: '#67c23a' },
  { value: 'sla_warning',            label: '预警',    color: '#e6a23c' },
  { value: 'sla_breached',           label: '超时',    color: '#f56c6c' },
  { value: 'sla_completed',          label: '完成',    color: '#67c23a' },
  { value: 'sla_closed_after_breach', label: '超时后关闭', color: '#f56c6c' },
  { value: 'sla_cancelled',          label: '取消',    color: '#909399' },
  { value: 'sla_deadline_changed',   label: '截止变更', color: '#409eff' },
  { value: 'sla_escalated',          label: '升级',    color: '#f56c6c' },
  { value: 'sla_notification_sent',  label: '通知已发', color: '#909399' },
  { value: 'sla_notification_failed', label: '通知失败', color: '#f56c6c' },
]
const SLA_STATUS_OPTIONS = [
  { value: 'pending',   label: '待启动' },
  { value: 'running',   label: '进行中' },
  { value: 'paused',    label: '已暂停' },
  { value: 'met',       label: '已达标' },
  { value: 'breached',  label: '已超时' },
  { value: 'breached_closed', label: '超时关闭' },
  { value: 'cancelled', label: '已取消' },
]

function eventLabel(v) { return EVENT_TYPE_OPTIONS.find(o => o.value === v)?.label || v }
function eventColor(v) { return EVENT_TYPE_OPTIONS.find(o => o.value === v)?.color || '#909399' }
function slaStatusLabel(v) { return SLA_STATUS_OPTIONS.find(o => o.value === v)?.label || v }
function formatInterval(s) {
  if (!s) return '—'
  // PG interval text like "00:04:30" or "1 day 02:30:00"
  return s
}
function reasonText(r) { return r ? (r.length > 30 ? r.slice(0, 30) + '…' : r) : '—' }

async function loadList() {
  loading.value = true
  try {
    const offset = (currentPage.value - 1) * PAGE_SIZE
    const params = { limit: PAGE_SIZE, offset }
    if (filter.ticketId) params.ticket_id = filter.ticketId.trim()
    if (filter.eventType) params.event_type = filter.eventType
    if (filter.slaStatus) params.sla_status = filter.slaStatus

    const data = await request.get('/sla-events', { params })
    rows.value = data?.list || []
    total.value = data?.total || 0
  } catch (e) {
    console.warn('[SlaEventList] 加载失败（可能后端未重启）:', e?.message)
    rows.value = []
    total.value = 0
  } finally { loading.value = false }
}

function handleFilter() { currentPage.value = 1; loadList() }
function resetFilter() {
  filter.ticketId = ''; filter.eventType = ''; filter.slaStatus = ''
  currentPage.value = 1; loadList()
}

const totalPages = computed(() => Math.ceil(total.value / PAGE_SIZE))

onMounted(loadList)
</script>

<template>
  <div class="sla-event-list">
    <!-- 筛选 -->
    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <el-input v-model="filter.ticketId" placeholder="工单 ID (如 WO00000000000001)" clearable style="width:260px" />
        <el-select v-model="filter.eventType" placeholder="全部事件类型" clearable style="width:180px">
          <el-option v-for="o in EVENT_TYPE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
        <el-select v-model="filter.slaStatus" placeholder="全部 SLA 状态" clearable style="width:160px">
          <el-option v-for="o in SLA_STATUS_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="handleFilter">查询</el-button>
        <el-button @click="resetFilter">重置</el-button>
        <span class="total-hint">共 {{ total }} 条</span>
      </div>
    </el-card>

    <!-- 表格 -->
    <el-card shadow="never" class="table-card">
      <el-table :data="rows" v-loading="loading" stripe size="default">
        <el-table-column prop="ticketId" label="工单" width="190">
          <template #default="{ row }">
            <span class="ticket-id">{{ row.ticketId }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="metricType" label="SLA 指标" width="120">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.metricType || '—' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="事件" width="120">
          <template #default="{ row }">
            <span class="event-badge" :style="{ background: eventColor(row.eventType) }">
              {{ eventLabel(row.eventType) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="状态流转" width="180">
          <template #default="{ row }">
            <span v-if="row.fromStatus">
              {{ slaStatusLabel(row.fromStatus) }}
              <span class="arrow"> → </span>
              <span :style="{ color: row.isBreached ? '#f56c6c' : '#67c23a', fontWeight: 600 }">
                {{ slaStatusLabel(row.toStatus) }}
              </span>
            </span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="已消耗" width="140">
          <template #default="{ row }">{{ formatInterval(row.elapsedDuration) }}</template>
        </el-table-column>
        <el-table-column label="剩余" width="140">
          <template #default="{ row }">{{ formatInterval(row.remainingDuration) }}</template>
        </el-table-column>
        <el-table-column label="触发方" width="110">
          <template #default="{ row }">{{ row.triggerSource || '—' }}</template>
        </el-table-column>
        <el-table-column prop="eventTime" label="时间" width="180" />
        <el-table-column label="备注" min-width="180">
          <template #default="{ row }">{{ reasonText(row.reason) }}</template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && rows.length === 0" description="暂无 SLA 事件（可能后端未重启或还没产生事件）" />

      <!-- 分页 -->
      <div v-if="total > PAGE_SIZE" class="pager">
        <el-pagination
          background
          :total="total"
          :page-size="PAGE_SIZE"
          v-model:current-page="currentPage"
          layout="prev, pager, next"
          @current-change="loadList"
        />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.sla-event-list { display:flex; flex-direction:column; gap:12px; }
.filter-card, .table-card { border-radius:8px; }

.filter-row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.total-hint { margin-left:auto; font-size:13px; color:#606266; }

.ticket-id { font-family: 'Consolas', 'Menlo', monospace; color:#14487e; font-weight:500; }

.event-badge {
  display:inline-block; padding:2px 10px; border-radius:10px;
  color:#fff; font-size:12px; font-weight:500;
}

.arrow { color:#c0c4cc; margin:0 4px; }
.muted { color:#909399; font-size:12px; }

.pager { margin-top:12px; display:flex; justify-content:center; }
</style>
