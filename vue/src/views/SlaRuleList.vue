<script setup>
/**
 * SLA 时效规则列表页（tab=rules 时渲染）
 *
 * 后端 API：
 *   GET  /api/sla-rules?ticket_type=     —— 所有规则（含历史版本、关联日历）
 *   POST /api/sla-rules                  —— 新增规则（同组自动 version+1，历史版本不可改）
 *   PATCH /api/sla-rules/:id             —— active 启停（版本内容不可改）
 *
 * 后端规则：版本化只增不改 → "编辑" 不是 PATCH 内容，而是 POST 新版本（copy 旧内容，改字段）
 *
 * 前端：
 *   - 列表按 (ticketType, metricType, priority, nodeSeq) 分组，每组只看最新版本
 *   - 详情弹窗展示某规则所有历史版本
 *   - 新建/编辑弹窗：都是 POST /api/sla-rules
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request.js'
import { TICKET_TYPES } from '@/composables/convertFlow'

// ===== 枚举字典 =====
const METRIC_OPTIONS = [
  { value: 'first_response', label: '首次响应' },
  { value: 'approval',       label: '审批时限' },
  { value: 'processing',    label: '处理时限' },
  { value: 'confirmation',   label: '确认时限' },
  { value: 'payment',       label: '支付时限' },
  { value: 'overall',       label: '总时限' },
]
const UNIT_OPTIONS = [
  { value: 'minute',       label: '分钟' },
  { value: 'work_hour',    label: '工时' },
  { value: 'work_day',     label: '工作日' },
  { value: 'natural_day',  label: '自然日' },
]
const PRIORITY_OPTIONS = [
  { value: null,   label: '不区分优先级' },
  { value: 'low',  label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'urgent', label: '紧急' },
]

function metricLabel(v) { return METRIC_OPTIONS.find(m => m.value === v)?.label || v }
function unitLabel(v) { return UNIT_OPTIONS.find(u => u.value === v)?.label || v }
function priorityLabel(v) { return PRIORITY_OPTIONS.find(p => p.value === v)?.label || '—' }
function ticketLabel(v) { return TICKET_TYPES.find(t => t.value === v)?.label || v }
function thresholdText(arr) {
  if (!arr?.length) return '—'
  return arr.map(n => n + '%').join(' → ')
}

// ===== 状态 =====
const loading = ref(false)
const filterType = ref('')
const allRows = ref([])       // 所有版本的原始 rows
const latestRows = ref([])    // 每组最新版本（用于列表渲染）

// ===== 加载 =====
async function loadList() {
  loading.value = true
  try {
    const params = {}
    if (filterType.value) params.ticket_type = filterType.value
    const rows = await request.get('/sla-rules', { params })
    allRows.value = rows || []
    // 取每组最新版本：groupBy (ticketType, metricType, priority, nodeSeq)，sort by version desc，取 first
    const map = new Map()
    for (const r of allRows.value) {
      const key = `${r.ticketType}|${r.metricType}|${r.priority ?? 'null'}|${r.nodeSeq ?? 'null'}`
      if (!map.has(key) || r.version > map.get(key).version) map.set(key, r)
    }
    latestRows.value = Array.from(map.values()).sort((a, b) => {
      const ta = TICKET_TYPES.findIndex(t => t.value === a.ticketType)
      const tb = TICKET_TYPES.findIndex(t => t.value === b.ticketType)
      if (ta !== tb) return ta - tb
      const ma = METRIC_OPTIONS.findIndex(m => m.value === a.metricType)
      const mb = METRIC_OPTIONS.findIndex(m => m.value === b.metricType)
      return ma - mb
    })
  } catch (e) {
    ElMessage.error('加载失败：' + (e?.message || e))
  } finally { loading.value = false }
}

// ===== 详情弹窗（某规则所有历史版本）=====
const showDetail = ref(false)
const detailRow = ref(null)
const detailVersions = computed(() => {
  if (!detailRow.value) return []
  const { ticketType, metricType, priority, nodeSeq } = detailRow.value
  return allRows.value
    .filter(r => r.ticketType === ticketType && r.metricType === metricType
             && (r.priority ?? null) === (priority ?? null)
             && (r.nodeSeq ?? null) === (nodeSeq ?? null))
    .sort((a, b) => b.version - a.version)
})
function openDetail(row) { detailRow.value = row; showDetail.value = true }

// ===== 启停 =====
async function toggleActive(row) {
  try {
    await ElMessageBox.confirm(`将 v${row.version} 「${metricLabel(row.metricType)}」设为 ${row.active ? '停用' : '启用'}？`, '确认', { type: 'warning' })
  } catch { return }
  try {
    const updated = await request.patch(`/sla-rules/${row.id}`, { active: !row.active })
    ElMessage.success(`已${updated.active ? '启用' : '停用'} v${updated.version}`)
    await loadList()
  } catch (e) { ElMessage.error('操作失败：' + (e?.message || e)) }
}

// ===== 新建 / 编辑（后端版本化：都是 POST）=====
const showForm = ref(false)
const form = ref(null)    // { mode: 'create'|'edit', data: {...} }
const submitting = ref(false)

function openCreate() {
  form.value = {
    mode: 'create',
    data: {
      ticketType: filterType.value || TICKET_TYPES[0].value,
      metricType: 'overall',
      priority: null,
      nodeSeq: null,
      targetValue: 3,
      targetUnit: 'natural_day',
      calendarId: null,
      warningThresholds: [50, 75, 90],
      repeatRemindInterval: null,
    },
  }
  showForm.value = true
}

function openEdit(row) {
  // 复制最新版本的内容，POST 新版本（版本号后端自动 +1）
  form.value = {
    mode: 'edit',
    rowLabel: `v${row.version} 「${metricLabel(row.metricType)}」`,
    data: {
      ticketType: row.ticketType,
      metricType: row.metricType,
      priority: row.priority ?? null,
      nodeSeq: row.nodeSeq ?? null,
      targetValue: row.targetValue,
      targetUnit: row.targetUnit,
      calendarId: row.calendarId ?? null,
      warningThresholds: row.warningThresholds || [50, 75, 90],
      repeatRemindInterval: row.repeatRemindInterval ?? null,
    },
  }
  showForm.value = true
}

async function submitForm() {
  const d = form.value?.data
  if (!d) return
  // 前端校验
  if (!TICKET_TYPES.find(t => t.value === d.ticketType)) return ElMessage.error('工单类型不合法')
  if (!d.targetValue || d.targetValue <= 0) return ElMessage.error('目标时限必须为正整数')
  if (!d.targetUnit) return ElMessage.error('请选单位')

  submitting.value = true
  try {
    const payload = {
      ticketType: d.ticketType,
      metricType: d.metricType,
      priority: d.priority ?? null,
      nodeSeq: d.nodeSeq ? Number(d.nodeSeq) : null,
      targetValue: Number(d.targetValue),
      targetUnit: d.targetUnit,
      calendarId: d.calendarId ? Number(d.calendarId) : null,
      warningThresholds: d.warningThresholds || [50, 75, 90],
      repeatRemindInterval: d.repeatRemindInterval || null,
    }
    const saved = await request.post('/sla-rules', payload)
    ElMessage.success(form.value.mode === 'create' ? `已新建 v${saved.version}` : `已发布 v${saved.version}`)
    showForm.value = false
    await loadList()
  } catch (e) {
    ElMessage.error('保存失败：' + (e?.message || e))
  } finally { submitting.value = false }
}

// ===== 日历列表（form 下拉用）=====
const calendars = ref([])
async function loadCalendars() {
  try {
    calendars.value = await request.get('/work-calendars')
  } catch { calendars.value = [] }
}

onMounted(() => { loadList(); loadCalendars() })
</script>

<template>
  <div class="sla-rule-list">
    <!-- 筛选 + 操作 -->
    <el-card shadow="never" class="header-card">
      <div class="header">
        <div class="filter">
          <el-select v-model="filterType" placeholder="全部工单类型" clearable style="width:200px" size="default" @change="loadList">
            <el-option v-for="t in TICKET_TYPES" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
          <el-button :loading="loading" @click="loadList">🔄 刷新</el-button>
        </div>
        <div>
          <el-button type="primary" @click="openCreate">➕ 新建规则</el-button>
        </div>
      </div>
    </el-card>

    <!-- 规则列表 -->
    <el-card shadow="never" class="table-card">
      <el-table :data="latestRows" v-loading="loading" stripe size="default">
        <el-table-column label="工单类型" width="130" :class-name="'col-type'">
          <template #default="{ row }">
            <el-tag size="small" type="primary" effect="plain">{{ ticketLabel(row.ticketType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="指标类型" width="130">
          <template #default="{ row }">
            <span class="metric">{{ metricLabel(row.metricType) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="适用范围" width="240">
          <template #default="{ row }">
            <div class="scope">
              <div>优先级：{{ priorityLabel(row.priority) }}</div>
              <div v-if="row.nodeSeq">审批节点序：第 {{ row.nodeSeq }} 级</div>
              <div v-else class="muted">（不绑定特定审批节点）</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="目标时限" width="180">
          <template #default="{ row }">
            <div class="target">
              <span class="target-val">{{ row.targetValue }}</span>
              <span class="target-unit">{{ unitLabel(row.targetUnit) }}</span>
              <span class="version-tag">v{{ row.version }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="预警阈值" width="180">
          <template #default="{ row }">
            <div>{{ thresholdText(row.warningThresholds) }}</div>
            <div v-if="row.repeatRemindInterval" class="muted">重复：{{ row.repeatRemindInterval }}</div>
          </template>
        </el-table-column>
        <el-table-column label="工作日历" width="150">
          <template #default="{ row }">
            <span v-if="row.calendarName">📅 {{ row.calendarName }}</span>
            <span v-else class="muted">自然日</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.active ? 'success' : 'info'" effect="dark" size="small">
              {{ row.active ? '🟢 有效' : '⚪ 停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button link size="small" @click="openDetail(row)">📋 历史版本</el-button>
            <el-button link size="small" type="primary" @click="openEdit(row)">✏️ 改新版本</el-button>
            <el-button link size="small" :type="row.active ? 'warning' : 'success'" @click="toggleActive(row)">
              {{ row.active ? '⏸️ 停用' : '▶️ 启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && latestRows.length === 0" description="暂无 SLA 规则，点右上角『新建规则』添加" />
    </el-card>

    <!-- ===== 历史版本详情弹窗 ===== -->
    <el-dialog v-model="showDetail" :title="detailRow ? `${metricLabel(detailRow.metricType)} · 历史版本` : ''" width="720px" destroy-on-close>
      <div v-if="detailRow" class="detail-summary">
        <el-tag type="primary" effect="plain">{{ ticketLabel(detailRow.ticketType) }}</el-tag>
        <span class="sep">·</span>
        {{ priorityLabel(detailRow.priority) }}
        <span class="sep">·</span>
        {{ detailRow.nodeSeq ? `第 ${detailRow.nodeSeq} 级审批` : '全局' }}
      </div>
      <el-table v-if="detailVersions.length" :data="detailVersions" size="small" border style="margin-top:12px">
        <el-table-column prop="version" label="版本" width="70">
          <template #default="{ row }">
            <el-tag :type="row.id === detailRow.id ? 'success' : 'info'" size="small">v{{ row.version }}</el-tag>
            <span v-if="row.id === detailRow.id" class="current-tag">当前</span>
          </template>
        </el-table-column>
        <el-table-column prop="targetValue" label="目标" width="80" />
        <el-table-column label="单位" width="100">
          <template #default="{ row }">{{ unitLabel(row.targetUnit) }}</template>
        </el-table-column>
        <el-table-column label="预警阈值" width="160">
          <template #default="{ row }">{{ thresholdText(row.warningThresholds) }}</template>
        </el-table-column>
        <el-table-column label="日历" width="110">
          <template #default="{ row }">{{ row.calendarName || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.active ? 'success' : 'info'" effect="dark" size="small">
              {{ row.active ? '有效' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button v-if="row.id !== detailRow.id" link size="small" type="primary" @click="openEdit(row)">✏️ 改</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- ===== 新建 / 编辑 弹窗 ===== -->
    <el-dialog
      v-model="showForm"
      :title="form?.mode === 'create' ? '➕ 新建 SLA 规则' : `✏️ 发布新版本（基于 ${form?.rowLabel}）`"
      width="560px"
      destroy-on-close
    >
      <el-form v-if="form" :model="form.data" label-width="110px" label-position="right">
        <el-form-item label="工单类型">
          <el-select v-model="form.data.ticketType" style="width:100%" :disabled="form.mode === 'edit'">
            <el-option v-for="t in TICKET_TYPES" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="指标类型">
          <el-select v-model="form.data.metricType" style="width:100%" :disabled="form.mode === 'edit'">
            <el-option v-for="m in METRIC_OPTIONS" :key="m.value" :label="m.label" :value="m.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="适用优先级">
          <el-select v-model="form.data.priority" clearable style="width:100%">
            <el-option v-for="p in PRIORITY_OPTIONS" :key="p.value ?? 'null'" :label="p.label" :value="p.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="绑定审批节点序">
          <el-input-number v-model="form.data.nodeSeq" :min="1" placeholder="不绑定则留空" style="width:100%" />
          <div class="form-tip">只对 approval 类指标有意义，留空表示不绑定特定节点</div>
        </el-form-item>
        <el-form-item label="目标时限">
          <div style="display:flex;gap:8px;width:100%">
            <el-input-number v-model="form.data.targetValue" :min="1" style="flex:1" />
            <el-select v-model="form.data.targetUnit" style="width:140px">
              <el-option v-for="u in UNIT_OPTIONS" :key="u.value" :label="u.label" :value="u.value" />
            </el-select>
          </div>
        </el-form-item>
        <el-form-item label="工作日历">
          <el-select v-model="form.data.calendarId" clearable placeholder="不绑定（自然日计算）" style="width:100%">
            <el-option v-for="c in calendars" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <div class="form-tip">绑定后目标时限按工作日历（跳过周末/节假日）计算</div>
        </el-form-item>
        <el-form-item label="预警阈值 (%)">
          <el-input
            v-model="form.data.warningThresholds"
            placeholder="[50, 75, 90]"
            style="width:100%"
            @blur="() => {
              if (typeof form.data.warningThresholds === 'string') {
                try { form.data.warningThresholds = JSON.parse(form.data.warningThresholds) } catch {}
              }
            }"
          />
          <div class="form-tip">数组形式，如 [50,75,90] 表示消耗 50%/75%/90% 时各发一次预警</div>
        </el-form-item>
        <el-form-item label="重复提醒间隔">
          <el-input v-model="form.data.repeatRemindInterval" placeholder="如 2 hours、1 work_day（可留空）" style="width:100%" />
          <div class="form-tip">PG interval 格式，留空则只发预警后不再重复</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showForm = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">
          {{ form?.mode === 'create' ? '新建规则' : '发布新版本' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.sla-rule-list { display:flex; flex-direction:column; gap:12px; }
.header-card, .table-card { border-radius:8px; }
.header { display:flex; justify-content:space-between; align-items:center; }
.filter { display:flex; gap:10px; align-items:center; }

.metric { font-weight:500; color:#14487e; }
.target-val { font-size:18px; font-weight:700; color:#14487e; }
.target-unit { margin-left:6px; color:#606266; }
.version-tag { margin-left:8px; font-size:11px; background:#e6eef7; color:#14487e; padding:1px 6px; border-radius:4px; }
.scope { font-size:13px; line-height:1.6; }
.muted { color:#909399; font-size:12px; }

.detail-summary { display:flex; align-items:center; gap:10px; font-size:14px; padding:6px 10px; background:#f5f7fa; border-radius:6px; }
.detail-summary .sep { color:#dcdfe6; }
.current-tag { margin-left:6px; font-size:11px; color:#67c23a; }

.form-tip { font-size:12px; color:#909399; margin-top:4px; line-height:1.4; }
</style>
