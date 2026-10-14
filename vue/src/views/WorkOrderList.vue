<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, Refresh, Search, Warning } from '@element-plus/icons-vue'
import { useWorkOrderStore } from '@/stores/workOrder'
import { useUserStore } from '@/stores/user'
import {
  DEPT_OPTIONS,
  PRIORITY_OPTIONS,
  PRIORITY_TAG_TYPE,
  STATUS_OPTIONS,
  STATUS_TAG_TYPE,
  TYPE_OPTIONS,
} from '@/mock/data'
import { isOverdue } from '@/utils/helpers'

const route = useRoute()
const router = useRouter()
const store = useWorkOrderStore()
const userStore = useUserStore()

// 输入中的查询条件（点“查询”后才生效）
const queryForm = reactive({
  keyword: '',
  dept: '',
  type: '',
  status: '',
  priority: '',
  dates: [],
})

// 已生效的查询条件 + 分页排序状态
const applied = reactive({
  keyword: '',
  dept: '',
  type: '',
  status: '',
  priority: '',
  dates: [],
  page: 1,
  pageSize: 10,
  sortProp: '',
  sortOrder: '',
})

const selectedRows = ref([])

// 从 URL query 恢复查询状态（URL 状态保持）
function hydrateFromQuery(q = route.query) {
  queryForm.keyword = q.keyword || ''
  queryForm.dept = q.dept || ''
  queryForm.type = q.type || ''
  queryForm.status = q.status || ''
  queryForm.priority = q.priority || ''
  queryForm.dates = q.dates ? q.dates.split(',') : []
  applied.keyword = queryForm.keyword
  applied.dept = queryForm.dept
  applied.type = queryForm.type
  applied.status = queryForm.status
  applied.priority = queryForm.priority
  applied.dates = [...queryForm.dates]
  applied.page = Number(q.page) || 1
  applied.pageSize = Number(q.pageSize) || 10
}

// 把当前状态写回 URL
function syncQuery() {
  const q = {}
  if (applied.keyword) q.keyword = applied.keyword
  if (applied.dept) q.dept = applied.dept
  if (applied.type) q.type = applied.type
  if (applied.status) q.status = applied.status
  if (applied.priority) q.priority = applied.priority
  if (applied.dates.length === 2) q.dates = applied.dates.join(',')
  if (applied.page > 1) q.page = applied.page
  if (applied.pageSize !== 10) q.pageSize = applied.pageSize
  router.replace({ path: '/work-orders', query: q })
}

// 筛选 + 排序后的完整数据
const filteredOrders = computed(() => {
  let list = store.orders.filter((o) => {
    if (applied.keyword) {
      const kw = applied.keyword.toLowerCase()
      if (!o.title.toLowerCase().includes(kw) && !o.id.toLowerCase().includes(kw)) return false
    }
    if (applied.dept && o.dept !== applied.dept) return false
    if (applied.type && o.type !== applied.type) return false
    if (applied.status && o.status !== applied.status) return false
    if (applied.priority && o.priority !== applied.priority) return false
    if (applied.dates.length === 2) {
      const day = o.createdAt.slice(0, 10)
      if (day < applied.dates[0] || day > applied.dates[1]) return false
    }
    return true
  })
  if (applied.sortProp && applied.sortOrder) {
    const dir = applied.sortOrder === 'ascending' ? 1 : -1
    list = [...list].sort((a, b) => (a[applied.sortProp] > b[applied.sortProp] ? dir : -dir))
  }
  return list
})

// 当前页数据
const pagedOrders = computed(() =>
  filteredOrders.value.slice((applied.page - 1) * applied.pageSize, applied.page * applied.pageSize),
)

const handleSearch = () => {
  Object.assign(applied, {
    keyword: queryForm.keyword.trim(),
    dept: queryForm.dept,
    type: queryForm.type,
    status: queryForm.status,
    priority: queryForm.priority,
    dates: [...queryForm.dates],
    page: 1,
  })
  syncQuery()
}

const handleReset = () => {
  Object.assign(queryForm, { keyword: '', dept: '', type: '', status: '', priority: '', dates: [] })
  Object.assign(applied, {
    keyword: '',
    dept: '',
    type: '',
    status: '',
    priority: '',
    dates: [],
    page: 1,
    pageSize: 10,
    sortProp: '',
    sortOrder: '',
  })
  syncQuery()
}

const handleSortChange = ({ prop, order }) => {
  applied.sortProp = order ? prop : ''
  applied.sortOrder = order || ''
}

const handleSelectionChange = (rows) => {
  selectedRows.value = rows
  console.log(rows)
}

const handleBatchClose = () => {
  const n = selectedRows.value.length
  ElMessageBox.confirm(`确定要关闭选中的 ${n} 条工单吗？待处理、处理中的工单将被关闭。`, '批量关闭确认', {
    confirmButtonText: '确定关闭',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(() => {
      const count = store.batchClose(selectedRows.value.map((r) => r.id))
      ElMessage.success(`已关闭 ${count} 条工单`)
      selectedRows.value = []
    })
    .catch(() => { })
}

const handleDelete = (row) => {
  store.removeOrders([row.id])
  ElMessage.success(`工单 ${row.id} 已删除`)
}

const handlePageChange = (page) => {
  applied.page = page
  syncQuery()
}
const handleSizeChange = (size) => {
  applied.pageSize = size
  applied.page = 1
  syncQuery()
}

// 点击提交人：按姓名找到用户则进个人详情页，找不到就跳用户列表按姓名筛选
const handleClickSubmitter = (row) => {
  const u = userStore.users.find((x) => x.name === row.submitter)
  if (u) {
    router.push(`/usercontrol/${u.id}`)
  } else {
    router.push({ path: '/usercontrol', query: { submitter: row.submitter } })
  }
}



const loadData = (forceError = false) => {
  store.fetchList(forceError).catch(() => {
    if (forceError) ElMessage.warning('已模拟一次接口异常，用于演示 Error 状态')
  })
}

const handleSimulateError = () => loadData(true)

// 浏览器前进/后退时，按 URL 重新恢复条件
watch(
  () => route.query,
  (q) => hydrateFromQuery(q),
)

hydrateFromQuery()
loadData()
</script>

<template>
  <div class="order-list">
    <!-- 查询区域 -->
    <el-card shadow="never" class="search-card">
      <el-form :model="queryForm" inline>
        <el-form-item label="工单标题">
          <el-input v-model="queryForm.keyword" placeholder="标题 / 编号" clearable style="width: 170px"
            @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="所属部门">
          <el-select v-model="queryForm.dept" placeholder="全部" clearable style="width: 130px">
            <el-option v-for="d in DEPT_OPTIONS" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="问题类型">
          <el-select v-model="queryForm.type" placeholder="全部" clearable style="width: 130px">
            <el-option v-for="t in TYPE_OPTIONS" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="queryForm.status" placeholder="全部" clearable style="width: 120px">
            <el-option v-for="s in STATUS_OPTIONS" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="queryForm.priority" placeholder="全部" clearable style="width: 120px">
            <el-option v-for="p in PRIORITY_OPTIONS" :key="p" :label="p" :value="p" />
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

    <!-- 表格区域 -->
    <el-card shadow="never" class="table-card">
      <div class="table-toolbar">
        <div class="toolbar-left">
          <span class="table-title">工单列表</span>
          <el-button type="danger" plain size="small" :disabled="selectedRows.length === 0" @click="handleBatchClose">
            批量关闭{{ selectedRows.length ? `（${selectedRows.length}）` : '' }}
          </el-button>
        </div>
        <div class="toolbar-right">
          <el-button text size="small" :icon="Refresh" @click="loadData()">刷新</el-button>
          <el-button text size="small" type="info" :icon="Warning" @click="handleSimulateError">
            模拟接口异常
          </el-button>
        </div>
      </div>

      <el-table v-loading="store.loading" :data="pagedOrders" border stripe style="width: 100%" row-key="id"
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

      <!-- Error 状态覆盖层 -->
      <div v-if="store.error" class="error-mask">
        <el-result icon="error" title="工单数据加载失败" sub-title="网络异常或服务暂时不可用，请稍后重试">
          <template #extra>
            <el-button type="primary" @click="loadData()">重新加载</el-button>
          </template>
        </el-result>
      </div>

      <div class="pagination">
        <el-pagination background layout="total, sizes, prev, pager, next, jumper" :total="filteredOrders.length"
          :current-page="applied.page" :page-size="applied.pageSize" :page-sizes="[5, 10, 20]"
          @current-change="handlePageChange" @size-change="handleSizeChange" />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.search-card,
.table-card {
  border-radius: 10px;
  border: none;
  box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
}

.search-card :deep(.el-form-item) {
  margin-bottom: 0;
}

.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.table-title {
  font-size: 16px;
  font-weight: 600;
  color: #14487e;
}

.overdue-tag {
  margin-left: 4px;
}

.error-mask {
  position: absolute;
  inset: 52px 0 50px;
  background: rgba(255, 255, 255, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
}

.table-card {
  position: relative;
  margin-top: 16px;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
