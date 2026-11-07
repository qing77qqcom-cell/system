<script setup>
defineOptions({ name: 'AuditLog' })
/**
 * 操作日志（审计日志）管理页 —— 超管可查看全部操作留痕
 * 后端接口：GET /api/logs/audit-logs?page=&pageSize=&actorId=&targetType=&targetId=&dateFrom=&dateTo
 * 返回结构：{ total, list, page, pageSize, totalPages }
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Search } from '@element-plus/icons-vue'
import request from '@/utils/request.js'

// ———————— 筛选表单 ————————
const filter = reactive({
  actorId: '',
  targetType: '',
  targetId: '',
  dateFrom: '',
  dateTo: '',
})

// targetType 下拉选项（后端 init.sql 里实际写入的 target_type）
const TARGET_TYPES = [
  { value: 'dictionary',       label: '数据字典' },
  { value: 'form_field',       label: '表单字段' },
  { value: 'flow_node',        label: '审批节点' },
  { value: 'flow_node_bulk',   label: '审批流程批量' },
  { value: 'sla_rule',         label: 'SLA 规则' },
  { value: 'system_param',     label: '系统参数' },
  { value: 'role_permission',  label: '角色权限' },
  { value: 'department',       label: '部门' },
  { value: 'user',             label: '用户' },
  { value: 'role',             label: '角色' },
]

// action 中文映射
const ACTION_MAP = {
  create:   '新增',
  update:   '修改',
  delete:   '删除',
  replace:  '整组替换',
  update_active: '启停切换',
  reset:    '重置',
}

// ———————— 分页 & 数据状态 ————————
const PAGE_SIZE = 20
const tableData = ref([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = ref(PAGE_SIZE)
const expandedRowIds = ref([])

// ———————— 加载数据 ————————
async function loadData() {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (filter.actorId)    params.actorId = filter.actorId.trim()
    if (filter.targetType) params.targetType = filter.targetType
    if (filter.targetId)   params.targetId = filter.targetId.trim()
    if (filter.dateFrom)   params.dateFrom = filter.dateFrom
    if (filter.dateTo)     params.dateTo = filter.dateTo

    const data = await request.get('/logs/audit-logs', { params })
    tableData.value = data.list || []
    total.value = data.total || 0
  } catch (e) {
    ElMessage.error('加载失败：' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

// ———————— 筛选操作 ————————
function handleSearch() {
  page.value = 1
  loadData()
}
function resetFilter() {
  filter.actorId = ''
  filter.targetType = ''
  filter.targetId = ''
  filter.dateFrom = ''
  filter.dateTo = ''
  page.value = 1
  loadData()
}

// ———————— 分页 ————————
function handlePageChange(p) {
  page.value = p
  loadData()
}
function handleSizeChange(s) {
  pageSize.value = s
  page.value = 1
  loadData()
}

// ———————— 工具：JSON 格式化 ————————
function formatJson(val) {
  if (val == null) return '—'
  if (typeof val === 'string') {
    try { return JSON.stringify(JSON.parse(val), null, 2) } catch { return val }
  }
  try { return JSON.stringify(val, null, 2) } catch { return String(val) }
}

function targetTypeLabel(v) {
  return TARGET_TYPES.find(t => t.value === v)?.label || v || '—'
}

function actionLabel(v) {
  return ACTION_MAP[v] || v || '—'
}

// 展开行默认展开前 3 条（避免一打开全展开太乱）
function toggleExpand(row) {
  const idx = expandedRowIds.value.indexOf(row.id)
  if (idx >= 0) expandedRowIds.value.splice(idx, 1)
  else expandedRowIds.value.push(row.id)
}

onMounted(() => { loadData() })
</script>

<template>
  <div class="audit-log-page">

    <!-- 筛选区 -->
    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="filter" @submit.prevent>
        <el-form-item label="操作人ID">
          <el-input v-model="filter.actorId" placeholder="数字" clearable style="width: 110px" />
        </el-form-item>
        <el-form-item label="对象类型">
          <el-select v-model="filter.targetType" placeholder="全部" clearable style="width: 160px">
            <el-option v-for="t in TARGET_TYPES" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="对象ID">
          <el-input v-model="filter.targetId" placeholder="可选" clearable style="width: 110px" />
        </el-form-item>
        <el-form-item label="操作时间">
          <el-input v-model="filter.dateFrom" type="date" style="width: 155px" />
          <span style="margin: 0 4px; color: #909399">~</span>
          <el-input v-model="filter.dateTo" type="date" style="width: 155px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
          <el-button :icon="Refresh" @click="resetFilter">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格区 -->
    <el-card class="table-card" shadow="never">
      <template #header>
        <div class="table-header">
          <span class="table-title">操作日志</span>
          <span class="table-tip">共 {{ total }} 条 · 点击行展开查看变更详情</span>
        </div>
      </template>

      <el-table
        :data="tableData"
        v-loading="loading"
        border
        stripe
        row-key="id"
        :default-expand-all="false"
        style="width: 100%"
        @row-click="toggleExpand"
      >
        <!-- 展开行：显示 before / after 的 JSON diff -->
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="expand-panel">
              <div class="expand-block">
                <div class="expand-label expand-before">变更前 (before)</div>
                <pre class="json-pre">{{ formatJson(row.before) }}</pre>
              </div>
              <div class="expand-arrow">→</div>
              <div class="expand-block">
                <div class="expand-label expand-after">变更后 (after)</div>
                <pre class="json-pre">{{ formatJson(row.after) }}</pre>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="actorName" label="操作人" width="100">
          <template #default="{ row }">
            <span>{{ row.actorName || 'ID:' + row.actorId }}</span>
          </template>
        </el-table-column>
        <el-table-column label="对象类型" width="120">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ targetTypeLabel(row.targetType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="targetId" label="对象ID" width="110" />
        <el-table-column label="动作" width="100">
          <template #default="{ row }">
            <el-tag :type="row.action === 'delete' ? 'danger' : row.action === 'create' ? 'success' : 'warning'" size="small">
              {{ actionLabel(row.action) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="操作时间" width="180" />
      </el-table>

      <div class="pagination">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          :current-page="page"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.audit-log-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 580px;
}

.filter-card,
.table-card {
  border-radius: 8px;
}

.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.table-title {
  font-size: 15px;
  font-weight: 600;
  color: #14487e;
}
.table-tip {
  font-size: 12px;
  color: #909399;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

/* 展开行面板 */
.expand-panel {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  background: #f7f9fc;
  border-radius: 6px;
  margin: 4px 0;
}
.expand-block {
  flex: 1;
  min-width: 0;
}
.expand-arrow {
  display: flex;
  align-items: center;
  font-size: 20px;
  color: #909399;
  padding: 0 4px;
}
.expand-label {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
  padding: 2px 8px;
  border-radius: 3px;
  display: inline-block;
}
.expand-before {
  background: #fef0f0;
  color: #f56c6c;
}
.expand-after {
  background: #f0f9eb;
  color: #67c23a;
}
.json-pre {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 10px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  max-height: 260px;
  overflow: auto;
  color: #44607e;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 行可点击提示 */
:deep(.el-table__row) {
  cursor: pointer;
}
</style>
