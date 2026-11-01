<script setup>
// 工单列表（自包含：左侧 Aside 状态筛选 + 右侧搜索/表格）
// 被两个父路由复用：
//   - /work-orders              → 传统 list-layout 入口
//   - /workbench/workorderlist  → 工作台子菜单入口
// Aside 高亮需同时匹配两种路径前缀
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { List } from '@element-plus/icons-vue'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import { listOrders, batchCloseOrders, deleteOrder } from '@/api/order'
import { getMeta } from '@/api/meta'
import { PRIORITY_TAG_TYPE, STATUS_TAG_TYPE } from '@/constants'
import { isOverdue } from '@/utils/helpers'
import { useLoading } from '@/composables/useLoading.js'
import { useAuthStore } from '@/stores/store.js'

// tab → 实际筛选参数的翻译表（三角色三级菜单项共用）
// scopeSql 已经按角色限制了工单范围，这里只是在 scope 内做额外筛选
const TAB_TRANSLATE = {
  mine:    { title: '我提交的',   applicantId: true },   // staff: 我提交 / leader: scopeSql 已是本部门 + 申请人=我
  handled:  { title: '我处理的',   handlerId: true },     // handlerId = 当前用户
  draft:    { title: '草稿箱',     status: 'draft' },
  all:      { title: '工单大厅',   /* scopeSql 足够 */ },
  dept:     { title: '本部门工单', /* scopeSql(leader)=本部门 */ },
  escalated:{ title: '异常工单',   escalated: 'true' },
}

// 状态筛选子菜单（动态 base path，支持两个入口：/work-orders 和 /workbench/workorderlist）
const route = useRoute()
const auth = useAuthStore()
const asideBase = computed(() => {
  if (route.path.startsWith('/workbench/workorderlist')) return '/workbench/workorderlist'
  return '/work-orders'
})

const visibleMenus = computed(() => [
  { title: '已提交', index: `${asideBase.value}`, icon: List, status: '' },
  { title: '待处理', index: `${asideBase.value}?status=pending_processing`, icon: List, status: 'pending_processing' },
  { title: '处理中', index: `${asideBase.value}?status=processing`, icon: List, status: 'processing' },
  { title: '已完成', index: `${asideBase.value}?status=pending_confirmation`, icon: List, status: 'pending_confirmation' },
  { title: '已关闭', index: `${asideBase.value}?status=closed`, icon: List, status: 'closed' },
  { title: '已退回', index: `${asideBase.value}?status=pending_approval`, icon: List, status: 'pending_approval' },
])

// Aside 高亮：当前 fullPath 匹配对应 query 项
const activeIndex = computed(() => {
  const status = route.query.status || ''
  const match = visibleMenus.value.find((m) => (m.status || '') === status)
  return match ? match.index : visibleMenus.value[0].index
})

// ====== 数据与查询（原 WorkOrderList 全部保留） ======
const router = useRouter()
const { loading, run } = useLoading()

const deptOptions = ref([])
const typeOptions = ref([])
const statusOptions = ref([])
const priorityOptions = ref([])

async function loadMeta() {
  const meta = await getMeta()
  deptOptions.value = meta.depts
  typeOptions.value = meta.types
  statusOptions.value = meta.statuses
  priorityOptions.value = meta.priorities
}

const orders = ref([])
const error = ref(false)

const queryForm = reactive({
  keyword: '', dept: '', type: '', status: '', priority: '', dates: [],
})
const applied = reactive({
  keyword: '', dept: '', type: '', status: '', priority: '', dates: [],
  tab: '', applicantId: '', handlerId: '', escalated: '',
  page: 1, pageSize: 5, sortProp: '', sortOrder: '',
})
const selectedRows = ref([])

// 标题：优先 tab 翻译标题，其次 status 匹配
const title = computed(() => {
  const tab = route.query.tab
  const status = route.query.status
  if (tab && TAB_TRANSLATE[tab]?.title) return TAB_TRANSLATE[tab].title
  if (!status) return '工单列表'
  const found = visibleMenus.value.find((m) => m.status === status)
  return found ? found.title : '工单列表'
})

// 把 route.query 的 tab/status 翻译成 applied 的实际筛选参数
function translateTabAndStatus(q) {
  // 先清 tab 派生出的字段（避免保留上一次 tab 的筛选）
  applied.applicantId = ''
  applied.handlerId = ''
  applied.escalated = ''

  if (q.tab && TAB_TRANSLATE[q.tab]) {
    const t = TAB_TRANSLATE[q.tab]
    if (t.applicantId) applied.applicantId = auth.user?.id || ''
    if (t.handlerId) applied.handlerId = auth.user?.id || ''
    if (t.status) applied.status = t.status
    if (t.escalated) applied.escalated = t.escalated
  } else if (q.status !== undefined) {
    applied.status = q.status
  }
}

function hydrateFromQuery(q = route.query) {
  queryForm.keyword = q.keyword || ''
  queryForm.dept = q.dept || ''
  queryForm.type = q.type || ''
  queryForm.status = q.status || ''
  queryForm.priority = q.priority || ''
  queryForm.dates = q.dates ? q.dates.split(',') : []
  Object.assign(applied, {
    keyword: queryForm.keyword,
    dept: queryForm.dept,
    type: queryForm.type,
    priority: queryForm.priority,
    dates: [...queryForm.dates],
    tab: q.tab || '',
    page: Number(q.page) || 1,
    pageSize: Number(q.pageSize) || 5,
  })
  translateTabAndStatus(q)
}

function syncQuery() {
  const q = {}
  if (applied.keyword) q.keyword = applied.keyword
  if (applied.dept) q.dept = applied.dept
  if (applied.type) q.type = applied.type
  if (applied.status) q.status = applied.status
  if (applied.priority) q.priority = applied.priority
  if (applied.dates.length === 2) q.dates = applied.dates.join(',')
  if (applied.page > 1) q.page = applied.page
  if (applied.pageSize !== 5) q.pageSize = applied.pageSize
  // 保持当前路径前缀（workbench 或 work-orders），只改 query
  router.replace({ path: route.path, query: q })
}

async function loadList() {
  error.value = false
  await run(async () => {
    const params = {}
    if (applied.keyword) params.keyword = applied.keyword
    if (applied.dept) params.dept = applied.dept
    if (applied.type) params.type = applied.type
    if (applied.status) params.status = applied.status
    if (applied.priority) params.priority = applied.priority
    if (applied.dates.length === 2) {
      params.dateFrom = applied.dates[0]
      params.dateTo = applied.dates[1]
    }
    // tab 派生出的额外筛选参数
    if (applied.applicantId) params.applicantId = applied.applicantId
    if (applied.handlerId) params.handlerId = applied.handlerId
    if (applied.escalated) params.escalated = applied.escalated
    try {
      orders.value = await listOrders(params)
    } catch {
      error.value = true
      orders.value = []
    }
  })
}

const sortedOrders = computed(() => {
  if (!applied.sortProp || !applied.sortOrder) return orders.value
  const dir = applied.sortOrder === 'ascending' ? 1 : -1
  return [...orders.value].sort((a, b) =>
    a[applied.sortProp] > b[applied.sortProp] ? dir : -dir,
  )
})
const pagedOrders = computed(() =>
  sortedOrders.value.slice((applied.page - 1) * applied.pageSize, applied.page * applied.pageSize),
)

const handleSearch = () => {
  Object.assign(applied, {
    keyword: queryForm.keyword.trim(),
    dept: queryForm.dept, type: queryForm.type,
    status: queryForm.status, priority: queryForm.priority,
    dates: [...queryForm.dates], page: 1,
  })
  syncQuery()
  loadList()
}
const handleReset = () => {
  Object.assign(queryForm, { keyword: '', dept: '', type: '', status: '', priority: '', dates: [] })
  Object.assign(applied, {
    keyword: '', dept: '', type: '', status: '', priority: '', dates: [],
    page: 1, pageSize: 5, sortProp: '', sortOrder: '',
  })
  syncQuery()
  loadList()
}
const handleSortChange = ({ prop, order }) => {
  applied.sortProp = order ? prop : ''
  applied.sortOrder = order || ''
}
const handleSelectionChange = (rows) => { selectedRows.value = rows }

const handleBatchClose = () => {
  const n = selectedRows.value.length
  ElMessageBox.confirm(`确定要关闭选中的 ${n} 条工单吗？待处理、处理中的工单将被关闭。`, '批量关闭确认', {
    confirmButtonText: '确定关闭', cancelButtonText: '取消', type: 'warning',
  })
    .then(async () => {
      const result = await batchCloseOrders(selectedRows.value.map((r) => r.id))
      ElMessage.success(`已关闭 ${result.count || n} 条工单`)
      selectedRows.value = []
      loadList()
    })
    .catch(() => { })
}

const handleDelete = (row) => {
  deleteOrder(row.id).then(() => {
    ElMessage.success(`工单 ${row.id} 已删除`)
    if (pagedOrders.value.length === 1 && applied.page > 1) applied.page -= 1
    loadList()
  }).catch(() => { })
}

const handlePageChange = (page) => { applied.page = page; syncQuery() }
const handleSizeChange = (size) => { applied.pageSize = size; applied.page = 1; syncQuery() }

const handleClickSubmitter = (row) => {
  if (row.submitterId) router.push(`/usercontrol/${row.submitterId}`)
  else router.push({ path: '/systemcontrol/usercontrol', query: { submitter: row.submitter } })
}

watch(() => route.query, (q) => { hydrateFromQuery(q); loadList() })

hydrateFromQuery()
loadMeta()
loadList()
</script>

<template>
  <div class="list-layout">


    <!-- 右侧主内容：搜索卡 + 表格卡 -->
    <div class="list-content">
      <div class="order-list">
        <el-card shadow="never" class="search-card">
          <el-form :model="queryForm" inline>
            <el-form-item label="工单标题">
              <el-input v-model="queryForm.keyword" placeholder="标题 / 编号" clearable style="width: 170px"
                @keyup.enter="handleSearch" />
            </el-form-item>
            <el-form-item label="所属部门">
              <el-select v-model="queryForm.dept" placeholder="全部" clearable style="width: 130px">
                <el-option v-for="d in deptOptions" :key="d" :label="d" :value="d" />
              </el-select>
            </el-form-item>
            <el-form-item label="问题类型">
              <el-select v-model="queryForm.type" placeholder="全部" clearable style="width: 130px">
                <el-option v-for="t in typeOptions" :key="t" :label="t" :value="t" />
              </el-select>
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="queryForm.status" placeholder="全部" clearable style="width: 120px">
                <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
              </el-select>
            </el-form-item>
            <el-form-item label="优先级">
              <el-select v-model="queryForm.priority" placeholder="全部" clearable style="width: 120px">
                <el-option v-for="p in priorityOptions" :key="p" :label="p" :value="p" />
              </el-select>
            </el-form-item>
            <el-form-item label="创建时间">
              <el-date-picker v-model="queryForm.dates" type="daterange" range-separator="至" start-placeholder="开始日期"
                end-placeholder="结束日期" value-format="YYYY-MM-DD" style="width: 240px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
              <el-button @click="handleReset">重置</el-button>
              <el-button type="primary" :icon="Plus" @click="router.push('/work-orders/create')">
                新建工单
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never" class="table-card">
          <div class="table-toolbar">
            <div class="toolbar-left">
              <span class="table-title">{{ title }}</span>
              <el-button type="danger" plain size="small" :disabled="selectedRows.length === 0" @click="handleBatchClose">
                批量关闭{{ selectedRows.length ? `（${selectedRows.length}）` : '' }}
              </el-button>
            </div>
            <div class="toolbar-right">
              <el-button text size="small" :icon="Refresh" @click="loadList">刷新</el-button>
            </div>
          </div>

          <el-table v-loading="loading" :data="pagedOrders" border stripe style="width: 100%" row-key="id"
            @selection-change="handleSelectionChange" @sort-change="handleSortChange">
            <el-table-column type="selection" width="46" align="center" />
            <el-table-column prop="id" label="编号" width="150" sortable="custom" />
            <el-table-column prop="title" label="标题" min-width="190" show-overflow-tooltip>
              <template #default="{ row }">
                <el-link type="primary" underline="never" @click="router.push(`/work-orders/${row.id}`)">
                  {{ row.title }}
                </el-link>
              </template>
            </el-table-column>
            <el-table-column prop="submitter" label="提交人" width="80">
              <template #default="{ row }">
                <el-link type="primary" underline="never" @click="handleClickSubmitter(row)">
                  {{ row.submitter }}
                </el-link>
              </template>
            </el-table-column>
            <el-table-column prop="dept" label="所属部门" width="90" />
            <el-table-column prop="type" label="问题类型" width="100" />
            <el-table-column prop="handler" label="处理人" width="80">
              <template #default="{ row }">{{ row.handler || '—' }}</template>
            </el-table-column>
            <el-table-column label="优先级" width="80" align="center">
              <template #default="{ row }">
                <el-tag :type="PRIORITY_TAG_TYPE[row.priority]" size="small">{{ row.priority }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="110" align="center">
              <template #default="{ row }">
                <el-tag :type="STATUS_TAG_TYPE[row.status]" size="small">{{ row.status }}</el-tag>
                <el-tag v-if="isOverdue(row)" type="danger" size="small" effect="dark" class="overdue-tag">
                  逾期
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="创建时间" width="150" sortable="custom" />
            <el-table-column label="操作" width="170" fixed="right" align="center">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="router.push(`/work-orders/${row.id}`)">
                  详情
                </el-button>
                <el-button text type="primary" size="small" @click="router.push(`/work-orders/${row.id}/edit`)">
                  编辑
                </el-button>
                <el-popconfirm title="确定删除该工单吗？删除后不可恢复" confirm-button-text="删除" cancel-button-text="取消"
                  confirm-button-type="danger" @confirm="handleDelete(row)">
                  <template #reference>
                    <el-button text type="danger" size="small">删除</el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty description="没有符合条件的工单，换个筛选条件试试吧" />
            </template>
          </el-table>

          <div v-if="error" class="error-mask">
            <el-result icon="error" title="工单数据加载失败" sub-title="网络异常或服务暂时不可用，请稍后重试">
              <template #extra>
                <el-button type="primary" @click="loadList">重新加载</el-button>
              </template>
            </el-result>
          </div>

          <div class="pagination">
            <el-pagination background layout="total, sizes, prev, pager, next, jumper" :total="orders.length"
              :current-page="applied.page" :page-size="applied.pageSize" :page-sizes="[5, 10, 20]"
              @current-change="handlePageChange" @size-change="handleSizeChange" />
          </div>
        </el-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ====== list-layout（从 listLayOut.vue 合并过来） ====== */
.list-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  height: 100%;
}
.sub-aside {
  width: 180px;
  flex-shrink: 0;
  background: #fff;
  border-radius: 8px;
  border-right: none;
}
.sub-aside :deep(.el-menu-item.is-active) {
  background: #eaf4fe;
  color: #1e88e5;
}
.list-content {
  flex: 1;
  min-width: 0;
}

/* ====== 原 WorkOrderList 样式 ====== */
.search-card,
.table-card {
  border-radius: 10px;
  border: none;
  box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
}
.search-card :deep(.el-form-item) { margin-bottom: 0; }
.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.toolbar-left { display: flex; align-items: center; gap: 12px; }
.table-title { font-size: 16px; font-weight: 600; color: #14487e; }
.overdue-tag { margin-left: 4px; }
.error-mask {
  position: absolute;
  inset: 52px 0 50px;
  background: rgba(255, 255, 255, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
}
.table-card { position: relative; margin-top: 16px; }
.pagination { display: flex; justify-content: flex-end; margin-top: 14px; }
</style>
