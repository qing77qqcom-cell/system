<script setup>
defineOptions({ name: 'UserList' })
/**
 * 用户管理页
 * 三种分类标准（左侧独立快捷筛选）：
 *   ① 用户类型（role_code: admin/leader/staff）
 *   ② 所属部门（dept 名称，从 /departments 动态加载）
 *   ③ 账号状态（启用/禁用/锁定）
 *
 * 后端：GET /api/users?keyword=&role=&dept=&status=&page=&pageSize=
 *
 * 表格部分已从 Element Plus 换成原生 HTML table + 原生 CSS
 */
import { computed, onMounted, onActivated, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
// 图标已换成内联 SVG，这些 import 不再需要
import { ElMessage, ElMessageBox } from 'element-plus'
import { ROLE, ROLE_LABELS, ROLE_OPTIONS, ROLE_TAG_TYPE, USER_STATUS_TAG_TYPE } from '@/constants'
import { listUsers, createUser, updateUser, toggleUserStatus, resetUserPassword, deleteUser } from '@/api/user'
import request from '@/utils/request.js'
import { useRoleCan } from '@/composables/useRoleCan.js'
import { useLoading } from '@/composables/useLoading.js'

const route = useRoute()
const router = useRouter()
const roleCan = useRoleCan()
const isAdmin = computed(() => roleCan.canManageUsers.value)

// ============ 三种分类的选项 ============
const deptTree = ref([])
async function loadDepts() {
  try {
    const list = await request.get('/departments')
    const map = new Map((list || []).map((d) => ({ ...d, children: [] })).map((d) => [d.id, d]))
    const roots = []
    for (const d of map.values()) {
      if (d.parentId && map.has(d.parentId)) map.get(d.parentId).children.push(d)
      else roots.push(d)
    }
    const sortTree = (arr) => { arr.sort((a, b) => (a.sort || 0) - (b.sort || 0)); arr.forEach((n) => n.children && sortTree(n.children)) }
    sortTree(roots)
    deptTree.value = [{ id: 'all', name: '全部部门', children: roots }]
  } catch { deptTree.value = [{ id: 'all', name: '全部部门', children: [] }] }
}

const STATUS_OPTIONS = [
  { value: '启用', label: '启用' },
  { value: '禁用', label: '禁用' },
  { value: '锁定', label: '锁定' },
]

// ============ 列表 ============
const rows = ref([])
const total = ref(0)
const { loading, run } = useLoading()

const selRole = ref('')
const selDept = ref('')
const selStatus = ref('')

const showAdv = ref(true)

const activeFilters = computed(() => {
  const list = []
  if (appliedKeyword.value) list.push({ key: 'keyword', label: '关键词', value: appliedKeyword.value })
  if (selRole.value) list.push({ key: 'role', label: '用户类型', value: ROLE_LABELS[selRole.value] || selRole.value })
  if (selDept.value) list.push({ key: 'dept', label: '所属部门', value: selDept.value })
  if (selStatus.value) list.push({ key: 'status', label: '账号状态', value: selStatus.value })
  return list
})
function clearFilter(key) {
  if (key === 'keyword') { keyword.value = ''; appliedKeyword.value = '' }
  if (key === 'role') selRole.value = ''
  if (key === 'dept') selDept.value = ''
  if (key === 'status') selStatus.value = ''
  pagination.page = 1
  loadList()
}

const collapsedNames = ref([])

const keyword = ref('')
const appliedKeyword = ref('')

const pagination = reactive({ page: 1, pageSize: 10 })

async function loadList() {
  await run(async () => {
    const params = { page: pagination.page, pageSize: pagination.pageSize }
    if (appliedKeyword.value) params.keyword = appliedKeyword.value
    if (selRole.value) params.role = selRole.value
    if (deptParam.value) params.dept = deptParam.value
    if (selStatus.value) params.status = selStatus.value
    const data = await listUsers(params)
    rows.value = data.list || []
    total.value = data.total || 0
  })
}

const setFilter = (field, val) => {
  if (field === 'role')    selRole.value    = val
  if (field === 'dept')    selDept.value    = val
  if (field === 'status')  selStatus.value  = val
  pagination.page = 1
  loadList()
}

function onDeptTreeClick(data) {
  selDept.value = data.id === 'all' ? '' : data.name
  pagination.page = 1
  loadList()
}

function getAllDeptNames(node, names = []) {
  if (node.id !== 'all') names.push(node.name)
  if (node.children) node.children.forEach((c) => getAllDeptNames(c, names))
  return names
}

const deptParam = computed(() => selDept.value || '')

const allDeptNames = computed(() => {
  const names = []
  const walk = (nodes) => nodes.forEach((n) => { if (n.id !== 'all') names.push(n.name); if (n.children?.length) walk(n.children) })
  walk(deptTree.value)
  return names
})

const applyKeyword = () => {
  appliedKeyword.value = keyword.value.trim()
  pagination.page = 1
  loadList()
}
const resetAll = () => {
  selRole.value = ''
  selDept.value = ''
  selStatus.value = ''
  keyword.value = ''
  appliedKeyword.value = ''
  pagination.page = 1
  loadList()
}

// —— 分页计算 ——
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pagination.pageSize)))
const pageNumbers = computed(() => {
  const list = []
  const current = pagination.page
  const totalP = totalPages.value
  // 最多显示 7 个页码：当前页前后各 3 个
  let start = Math.max(1, current - 3)
  let end = Math.min(totalP, start + 6)
  if (end - start < 6) start = Math.max(1, end - 6)
  for (let i = start; i <= end; i++) list.push(i)
  return list
})

const handlePageChange = (p) => {
  if (p < 1 || p > totalPages.value || p === pagination.page) return
  pagination.page = p
  loadList()
}
const handleSizeChange = (s) => { pagination.pageSize = s; pagination.page = 1; loadList() }

// ============ 新增 / 编辑弹窗 ============
const dialogVisible = ref(false)
const dialogMode = ref('add')
const formRef = ref()
const form = reactive({ id: null, username: '', name: '', role: '', dept: '', email: '' })

const rules = {
  username: [
    { required: true, message: '请输入账号', trigger: 'blur' },
    { min: 3, message: '账号至少 3 位', trigger: 'blur' },
  ],
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  dept: [
    {
      validator: (_, v, cb) => (form.role === ROLE.ADMIN || v ? cb() : cb(new Error('请选择部门'))),
      trigger: 'change',
    },
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
}

const openAdd = () => {
  dialogMode.value = 'add'
  Object.assign(form, { id: null, username: '', name: '', role: '', dept: '', email: '' })
  dialogVisible.value = true
}
const openEdit = (row) => {
  dialogMode.value = 'edit'
  Object.assign(form, { id: row.id, username: row.username, name: row.name, role: row.role, dept: row.dept, email: row.email })
  dialogVisible.value = true
}

const handleSubmit = async () => {
  try { await formRef.value.validate() } catch { ElMessage.error('请完善必填信息'); return }
  try {
    const dept = form.role === ROLE.ADMIN ? form.dept || null : form.dept
    if (dialogMode.value === 'add') {
      await createUser({ username: form.username.trim().toLowerCase(), name: form.name.trim(), role: form.role, dept, email: form.email?.trim() || null })
      ElMessage.success('用户创建成功')
    } else {
      await updateUser(form.id, { name: form.name.trim(), role: form.role, dept, email: form.email?.trim() || null })
      ElMessage.success('用户修改成功')
    }
    dialogVisible.value = false
    loadList()
  } catch { /* 拦截器已提示 */ }
}

// ============ 启停 / 重置密码 / 删除 ============
const handleToggle = (row) => {
  const action = row.status === '启用' ? '禁用' : '启用'
  ElMessageBox.confirm(`确定要${action}用户「${row.name}」吗？${action === '禁用' ? '禁用后该用户将无法登录。' : ''}`, `${action}用户`,
    { confirmButtonText: `确定${action}`, cancelButtonText: '取消', type: 'warning' })
    .then(async () => { await toggleUserStatus(row.id, action); ElMessage.success(`已${action}用户 ${row.name}`); loadList() })
    .catch(() => { })
}
const handleResetPwd = (row) => {
  ElMessageBox.confirm(`确定要将「${row.name}」的密码重置为默认密码 123456 吗？`, '重置密码',
    { confirmButtonText: '重置', cancelButtonText: '取消', type: 'warning' })
    .then(async () => { await resetUserPassword(row.id); ElMessage.success(`用户 ${row.name} 的密码已重置为 123456`) })
    .catch(() => { })
}
const handleDelete = (row) => {
  ElMessageBox.confirm(`确定要删除用户「${row.name}」吗？删除后不可恢复。`, '删除用户',
    { confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonType: 'danger' })
    .then(async () => {
      await deleteUser(row.id)
      ElMessage.success(`用户 ${row.name} 已删除`)
      if (rows.value.length === 1 && pagination.page > 1) pagination.page -= 1
      loadList()
    })
    .catch(() => { })
}

const goDetail = (row) => router.push(`/usercontrol/${row.id}`)

// 根据 tag type 映射到 CSS 类名（替代 el-tag 的 type prop）
function tagClass(type) {
  return `tag tag--${type || 'info'}`
}

watch(() => route.query.submitter, (name) => {
  if (name) { keyword.value = name; appliedKeyword.value = name; pagination.page = 1; loadList() }
}, { immediate: true })

onMounted(async () => { await Promise.all([loadDepts(), loadList()]) })
onActivated(async () => { await loadList() })
</script>

<template>
  <div class="user-list">
    <!-- ========== 左侧：可折叠的三种分类快捷筛选 ========== -->
    <div class="side">
      <el-collapse v-model="collapsedNames" class="side-collapse">
        <el-collapse-item name="role">
          <template #title><span class="collapse-title">用户类型</span></template>
          <el-menu
            :default-active="selRole || '全部'"
            class="side-menu"
            @select="(val) => setFilter('role', val === '全部' ? '' : val)"
          >
            <el-menu-item index="全部">全部</el-menu-item>
            <el-menu-item v-for="r in ROLE_OPTIONS" :key="r.value" :index="r.value">{{ r.label }}</el-menu-item>
          </el-menu>
        </el-collapse-item>

        <el-collapse-item name="dept">
          <template #title><span class="collapse-title">所属部门</span></template>
          <el-tree
            :data="deptTree"
            :props="{ children: 'children', label: 'name' }"
            node-key="id"
            :expand-on-click-node="false"
            default-expand-all
            highlight-current
            @node-click="onDeptTreeClick"
            class="side-tree"
          />
        </el-collapse-item>

        <el-collapse-item name="status">
          <template #title><span class="collapse-title">账号状态</span></template>
          <el-menu
            :default-active="selStatus || '全部'"
            class="side-menu"
            @select="(val) => setFilter('status', val === '全部' ? '' : val)"
          >
            <el-menu-item index="全部">全部</el-menu-item>
            <el-menu-item v-for="s in STATUS_OPTIONS" :key="s.value" :index="s.value">{{ s.label }}</el-menu-item>
          </el-menu>
        </el-collapse-item>
      </el-collapse>
    </div>

    <!-- ========== 右侧 ========== -->
    <div class="main">
      <!-- 关键词 + 操作栏（全原生 HTML） -->
      <div class="card toolbar-card">
        <div class="toolbar-row">
          <!-- 原生搜索输入框（前缀图标 + input + 清除按钮） -->
          <label class="search-wrap">
            <span class="search-prefix" aria-hidden="true">
              <!-- Search 图标 -->
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              class="search-input"
              v-model="keyword"
              placeholder="按账号 / 姓名 / 邮箱模糊搜索"
              @keyup.enter="applyKeyword"
            />
            <button
              v-if="keyword"
              type="button"
              class="search-clear"
              @click="keyword = ''; appliedKeyword = ''; pagination.page = 1; loadList()"
              aria-label="清除"
            >×</button>
          </label>

          <button type="button" class="btn btn--primary" @click="applyKeyword">搜索</button>
          <button type="button" class="btn btn--default" @click="showAdv = !showAdv">
            筛选
            <span class="chev" :class="{ up: showAdv }">▾</span>
          </button>

          <div class="toolbar-right">
            <span class="total-badge">共 {{ total }} 条</span>
            <button type="button" class="btn btn--text" @click="loadList">刷新</button>
            <button v-if="isAdmin" type="button" class="btn btn--primary" @click="openAdd">+ 新增用户</button>
          </div>
        </div>

        <div v-show="showAdv" class="toolbar-adv">
          <div class="adv-row">
            <span class="adv-label">用户类型：</span>
            <!-- 原生 select，加一个空 option 当 clearable -->
            <select class="adv-select" v-model="selRole" @change="loadList">
              <option value="">全部</option>
              <option v-for="r in ROLE_OPTIONS" :key="r.value" :value="r.value">{{ r.label }}</option>
            </select>

            <span class="adv-label">所属部门：</span>
            <select class="adv-select" v-model="selDept" @change="loadList">
              <option value="">全部</option>
              <option v-for="d in allDeptNames" :key="d" :value="d">{{ d }}</option>
            </select>

            <span class="adv-label">账号状态：</span>
            <select class="adv-select" v-model="selStatus" @change="loadList">
              <option value="">全部</option>
              <option v-for="s in STATUS_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>

            <button type="button" class="btn btn--text" @click="resetAll">清空全部</button>
          </div>

          <!-- 已选筛选条件：原生 tag + × 按钮 -->
          <div v-if="activeFilters.length" class="active-filters">
            <span class="adv-label">已筛选：</span>
            <span
              v-for="f in activeFilters"
              :key="f.key"
              class="filter-tag"
            >
              {{ f.label }} = {{ f.value }}
              <button type="button" class="filter-tag__close" @click="clearFilter(f.key)" aria-label="关闭">×</button>
            </span>
          </div>
        </div>
      </div>

      <!-- ========== 原生 HTML 表格 ========== -->
      <div class="card table-card">
        <!-- loading 遮罩（替代 el-table 的 v-loading） -->
        <div v-if="loading" class="table-loading">
          <span class="table-loading__spinner"></span>
          <span class="table-loading__text">加载中…</span>
        </div>

        <!-- 表格外层滚动容器（横向滚动 + sticky 表头前提） -->
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:130px">账号</th>
                <th style="width:90px">姓名</th>
                <th style="width:110px;text-align:center">用户类型</th>
                <th style="width:110px">所属部门</th>
                <th style="min-width:170px">邮箱</th>
                <th style="width:80px;text-align:center">账号状态</th>
                <th style="width:160px">创建时间</th>
                <th class="col-fixed-right" :style="{ width: isAdmin ? 300 : 80 }" style="text-align:center">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id">
                <td class="cell-primary">{{ row.username }}</td>
                <td>{{ row.name }}</td>
                <td style="text-align:center">
                  <span :class="tagClass(ROLE_TAG_TYPE[row.role])">{{ ROLE_LABELS[row.role] || row.role }}</span>
                </td>
                <td>{{ row.dept || '—' }}</td>
                <td class="cell-ellipsis" :title="row.email">{{ row.email }}</td>
                <td style="text-align:center">
                  <!-- 状态列：圆形状态点 + 文字（纯 CSS） -->
                  <span class="status-dot" :class="'status-' + row.status"></span>
                  <span :class="tagClass(USER_STATUS_TAG_TYPE[row.status])">{{ row.status }}</span>
                </td>
                <td class="cell-muted">{{ row.createdAt }}</td>
                <td class="col-fixed-right" style="text-align:center">
                  <div class="op-btns">
                    <button type="button" class="op-btn op-btn--primary" @click="goDetail(row)">详情</button>
                    <template v-if="isAdmin">
                      <button type="button" class="op-btn op-btn--primary" @click="openEdit(row)">编辑</button>
                      <button
                        type="button"
                        :class="['op-btn', row.status === '启用' ? 'op-btn--warning' : 'op-btn--success']"
                        @click="handleToggle(row)"
                      >{{ row.status === '启用' ? '禁用' : '启用' }}</button>
                      <button type="button" class="op-btn op-btn--info" @click="handleResetPwd(row)">重置密码</button>
                      <button type="button" class="op-btn op-btn--danger" @click="handleDelete(row)">删除</button>
                    </template>
                  </div>
                </td>
              </tr>

              <!-- 空状态 -->
              <tr v-if="!loading && rows.length === 0">
                <td class="empty-cell" :colspan="8">
                  <div class="empty-box">
                    <div class="empty-icon"></div>
                    <p class="empty-text">没有符合条件的用户</p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ========== 原生分页控件 ========== -->
        <div class="pagination">
          <span class="pg-info">共 {{ total }} 条</span>

          <select class="pg-size" v-model.number="pagination.pageSize" @change="handleSizeChange(pagination.pageSize)">
            <option :value="5">5 / 页</option>
            <option :value="10">10 / 页</option>
            <option :value="20">20 / 页</option>
            <option :value="50">50 / 页</option>
          </select>

          <button class="pg-btn" :disabled="pagination.page === 1" @click="handlePageChange(pagination.page - 1)">上一页</button>

          <button
            v-for="p in pageNumbers"
            :key="p"
            :class="['pg-btn', 'pg-btn--num', { active: p === pagination.page }]"
            @click="handlePageChange(p)"
          >{{ p }}</button>

          <button class="pg-btn" :disabled="pagination.page >= totalPages" @click="handlePageChange(pagination.page + 1)">下一页</button>

          <div class="pg-jump">
            <span>跳至</span>
            <input
              type="number"
              class="pg-input"
              :value="pagination.page"
              :min="1"
              :max="totalPages"
              @keyup.enter="(e) => handlePageChange(Number(e.target.value))"
            />
            <span>页</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== 新增 / 编辑弹窗（保留 el-dialog + el-form，没换） ========== -->
    <el-dialog v-model="dialogVisible" :title="dialogMode === 'add' ? '新增用户' : '编辑用户'" width="480px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="账号" prop="username">
          <el-input v-model="form.username" placeholder="登录账号" :disabled="dialogMode === 'edit'" />
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="form.name" placeholder="用户姓名" />
        </el-form-item>
        <el-form-item label="用户类型" prop="role">
          <el-select v-model="form.role" placeholder="请选择角色" style="width: 100%">
            <el-option v-for="r in ROLE_OPTIONS" :key="r.value" :label="r.label" :value="r.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属部门" prop="dept">
          <el-select v-model="form.dept" placeholder="请选择部门" clearable style="width: 100%">
            <el-option v-for="d in allDeptNames" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" placeholder="example@oa.com" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.user-list { display: flex; gap: 16px; align-items: flex-start; }

/* 左侧 */
.side {
  width: 210px; flex-shrink: 0; background: #fff; border-radius: 8px;
  box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
  position: sticky; top: 0; overflow: hidden;
}
.side-collapse { border: none; }
.side-collapse :deep(.el-collapse-item__header) {
  padding: 0 16px; height: 40px; line-height: 40px;
  background: #f8fafc; border-bottom: 1px solid #eef2f7;
  font-size: 13px; font-weight: 600; color: #14487e;
}
.side-collapse :deep(.el-collapse-item__header:hover) { background: #eef4fb; }
.side-collapse :deep(.el-collapse-item__wrap) { border-bottom: 1px solid #eef2f7; }
.side-collapse :deep(.el-collapse-item:last-child .el-collapse-item__wrap) { border-bottom: none; }
.side-collapse :deep(.el-collapse-item__content) { padding: 4px 0; }
.collapse-title { font-size: 13px; color: #14487e; }

.side-menu { border-right: none; }
.side-menu :deep(.el-menu-item) { padding-left: 24px; font-size: 13px; height: 32px; line-height: 32px; }

.side-tree :deep(.el-tree-node__content) { height: 30px; line-height: 30px; font-size: 13px; }
.side-tree :deep(.el-tree-node.is-current > .el-tree-node__content) { background: #eef4fb; color: #14487e; font-weight: 600; }

.main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }

.toolbar-card, .table-card { border-radius: 10px; border: none; box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06); }

/* —— 通用卡片（替代 el-card） —— */
.card {
  background: #fff;
  padding: 18px 20px;
}

/* ============ 原生按钮系统（替代 el-button） ============ */
.btn {
  height: 32px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}
.btn:active { transform: scale(0.97); }
.btn:disabled { cursor: not-allowed; opacity: 0.5; }

/* type="primary" — 蓝色实底 */
.btn--primary {
  background: #409eff;
  border-color: #409eff;
  color: #fff;
  box-shadow: 0 2px 4px rgba(64, 158, 255, 0.25);
}
.btn--primary:hover:not(:disabled) {
  background: #66b1ff;
  border-color: #66b1ff;
}

/* type="default" — 白底灰边 */
.btn--default {
  background: #fff;
  border-color: #dcdfe6;
  color: #606266;
}
.btn--default:hover:not(:disabled) {
  color: #409eff;
  border-color: #c6e2ff;
  background: #ecf5ff;
}

/* text 按钮 — 无边框无背景 */
.btn--text {
  background: transparent;
  color: #606266;
  padding: 0 8px;
}
.btn--text:hover:not(:disabled) {
  color: #409eff;
  background: #ecf5ff;
}

/* 筛选按钮里的箭头 */
.chev {
  font-size: 12px;
  transition: transform 0.2s;
  display: inline-block;
  margin-left: 2px;
}
.chev.up { transform: rotate(180deg); }

/* ============ 原生搜索输入框 ============ */
.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  width: 260px;
  height: 32px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.search-wrap:focus-within {
  border-color: #409eff;
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.1);
}
.search-prefix {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 100%;
  color: #a8abb2;
  flex-shrink: 0;
}
.search-input {
  flex: 1;
  width: 0;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: #303133;
}
.search-input::placeholder { color: #c0c4cc; }
.search-clear {
  all: unset;
  width: 20px;
  height: 20px;
  margin-right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #c0c4cc;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.search-clear:hover { background: #f0f2f5; color: #909399; }

/* ============ 原生 select（下拉框） ============ */
.adv-select {
  height: 32px;
  padding: 0 28px 0 10px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
  /* 原生箭头用 CSS 画 */
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3e%3cpath d='M6 8L1 3h10z' fill='%23909399'/%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 8px center;
  transition: border-color 0.15s;
}
.adv-select:focus {
  outline: none;
  border-color: #409eff;
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.1);
}
.adv-select:hover { border-color: #c0c4cc; }

/* ============ 原生 filter-tag（替代 el-tag closable） ============ */
.filter-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  background: #fdf6ec;
  color: #e6a23c;
  border: 1px solid #faecd8;
  line-height: 20px;
  margin-right: 6px;
}
.filter-tag__close {
  all: unset;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
  color: #e6a23c;
  font-size: 14px;
  line-height: 1;
  transition: background 0.15s, color 0.15s;
}
.filter-tag__close:hover {
  background: rgba(230, 162, 60, 0.15);
  color: #b88230;
}

.toolbar-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.toolbar-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }

/* 原生 badge 替代 el-tag type=info */
.total-badge {
  display: inline-block; padding: 2px 10px; border-radius: 12px;
  font-size: 12px; color: #909399; background: #f4f4f5;
  border: 1px solid #e9e9eb;
}

.toolbar-adv {
  margin-top: 12px; padding-top: 12px;
  border-top: 1px dashed #e4e7ed;
  display: flex; flex-direction: column; gap: 10px;
}
.adv-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.adv-label { font-size: 13px; color: #606266; white-space: nowrap; }

.active-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.active-filters :deep(.el-tag) { max-width: 200px; }

/* ============ loading 遮罩 ============ */
.table-card { position: relative; }  /* 给遮罩当定位参考 */
.table-loading {
  position: absolute;                /* 盖在表格上 */
  inset: 0;                          /* top/right/bottom/left: 0 四边贴紧父级 */
  z-index: 10;
  background: rgba(255, 255, 255, 0.7);
  display: flex;
  flex-direction: column;            /* spinner 和 text 竖排 */
  align-items: center;
  justify-content: center;
  gap: 12px;
  backdrop-filter: blur(2px);
}
/* 转圈：border 画圆 + 一边颜色不同 → 旋转时就像缺口在跑 */
.table-loading__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e4e7ed;         /* 三边（上下左）灰色 */
  border-top-color: #409eff;         /* 上边蓝色 → 缺口 */
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.table-loading__text { font-size: 13px; color: #606266; }

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ============ 表格外层滚动容器 ============ */
.table-scroll {
  overflow-x: auto;                  /* 手机上横向滚动 */
  overflow-y: visible;               /* 让 tr:hover 的阴影不被裁掉 */
}

/* ============ 原生 table ============ */
.data-table {
  width: 100%;
  min-width: 900px;                  /* 比视口窄的手机触发横向滚动 */
  border-collapse: separate;         /* 用 separate 才能给 border-spacing + 让表头/行阴影独立 */
  border-spacing: 0;                 /* 把间隙设为 0（默认是 separate 有间隙） */
  font-size: 13px;
  color: #303133;
}

/* —— 表头 —— */
.data-table thead th {
  /* sticky 表头：滚表体时表头不动 */
  position: sticky;
  top: 0;
  z-index: 3;
  height: 44px;
  padding: 0 14px;
  background: #fafafa;               /* 比表体稍深的背景，滚动时分得清 */
  color: #606266;
  font-weight: 600;
  text-align: left;
  border-bottom: 1px solid #ebeef5;
  white-space: nowrap;
}
/* 表头第一个 cell 和最后一个操作列（sticky right），z-index 叠到最上 */
.data-table thead th.col-fixed-right {
  z-index: 4;                        /* 比表头同级高一层，防止右侧固定列滚上去被其他 th 盖住 */
}

/* —— 表体行 —— */
.data-table tbody tr {
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
}
/* 斑马纹：奇数行变浅灰 */
.data-table tbody tr:nth-child(odd) { background: #fafbfc; }
/* hover 行高亮 + 微上移 + 阴影（用伪元素或 box-shadow 实现"悬浮"感） */
.data-table tbody tr:hover {
  background: #ecf5ff;
  box-shadow: inset 0 0 0 9999px rgba(64, 158, 255, 0.04);  /* trick: 用巨大 inset shadow 填满背景，避免覆盖 hover 色 */
}
.data-table tbody tr:hover td {
  background: transparent;           /* 让 td 透明，这样 tr 的背景 + box-shadow 效果能透出来 */
}

/* —— 单元格 —— */
.data-table tbody td {
  height: 48px;
  padding: 0 14px;
  border-bottom: 1px solid #ebeef5;
  vertical-align: middle;
  background: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 奇数行的 td 也要跟 tr 的斑马纹同步（因为上面 hover 把 td 设透明了） */
.data-table tbody tr:nth-child(odd) td { background: #fafbfc; }

/* —— 固定右侧操作列 —— */
/* 核心：position: sticky + right: 0 + 背景白（不然滚到下面字会透） */
.col-fixed-right {
  position: sticky;
  right: 0;
  background: #fff;
  z-index: 2;
  border-left: 1px solid #ebeef5;    /* 和左边滚动区域加分隔线 */
}
/* hover 时固定列的背景也要跟着变 */
.data-table tbody tr:hover td.col-fixed-right {
  background: #ecf5ff;
}
.data-table tbody tr:nth-child(odd) td.col-fixed-right {
  background: #fafbfc;
}

/* ============ Tag 颜色系统 ============ */
/* 替代 el-tag 的 type prop，自己写 5 种颜色 */
.tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 20px;
  font-weight: 500;
  white-space: nowrap;
}
.tag--primary  { background: #ecf5ff; color: #409eff; border: 1px solid #d9ecff; }
.tag--success  { background: #f0f9eb; color: #67c23a; border: 1px solid #e1f3d8; }
.tag--warning  { background: #fdf6ec; color: #e6a23c; border: 1px solid #faecd8; }
.tag--danger   { background: #fef0f0; color: #f56c6c; border: 1px solid #fde2e2; }
.tag--info     { background: #f4f4f5; color: #909399; border: 1px solid #e9e9eb; }

/* ============ 状态圆 ============ */
/* 纯 CSS 画圆：width=height + border-radius:50% */
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}
/* 不同状态不同颜色 */
.status-dot.status-启用 { background: #67c23a; box-shadow: 0 0 4px rgba(103, 194, 58, 0.5); }
.status-dot.status-禁用 { background: #909399; }
.status-dot.status-锁定 { background: #f56c6c; box-shadow: 0 0 4px rgba(245, 108, 108, 0.5); }

/* ============ 单元格工具类 ============ */
.cell-primary { font-weight: 600; color: #303133; }
.cell-ellipsis {
  max-width: 200px;                  /* 给个最大宽度，让省略号有机会触发 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-muted { color: #909399; font-size: 12px; }

/* ============ 空状态 ============ */
.empty-cell {
  padding: 60px 0 !important;
  background: #fff !important;       /* 不跟斑马纹 */
  text-align: center;
}
.empty-box { display: inline-flex; flex-direction: column; align-items: center; gap: 12px; }
/* 纯 CSS 画的空盒子图标：一个方框 + 里面画两条横线 */
.empty-icon {
  width: 80px;
  height: 70px;
  border: 2px dashed #dcdfe6;
  border-radius: 6px;
  position: relative;
  opacity: 0.6;
}
.empty-icon::before,
.empty-icon::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  height: 2px;
  background: #dcdfe6;
  border-radius: 2px;
}
.empty-icon::before { top: 22px; }
.empty-icon::after  { top: 36px; }
.empty-text { margin: 0; color: #909399; font-size: 13px; }

/* ============ 操作按钮组 ============ */
.op-btns {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  justify-content: center;
}
/* 原生 button 默认样式干掉 */
.op-btn {
  all: unset;                         /* 一键清除 button 默认样式（border/background/padding/font 全清） */
  cursor: pointer;
  font-size: 12px;
  padding: 3px 6px;
  border-radius: 3px;
  transition: background 0.15s;
}
.op-btn:hover { background: rgba(0, 0, 0, 0.04); }
.op-btn--primary { color: #409eff; }
.op-btn--warning { color: #e6a23c; }
.op-btn--success { color: #67c23a; }
.op-btn--info    { color: #909399; }
.op-btn--danger  { color: #f56c6c; }
.op-btn--danger:hover { background: rgba(245, 108, 108, 0.08); }

/* ============ 分页控件 ============ */
.pagination {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding: 4px 0;
  flex-wrap: wrap;
}
.pg-info { font-size: 13px; color: #606266; }

/* 每页条数 select */
.pg-size {
  height: 28px;
  padding: 0 6px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #fff;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
}
.pg-size:focus { outline: none; border-color: #409eff; }

/* 通用页码按钮 */
.pg-btn {
  min-width: 30px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #fff;
  color: #606266;
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.pg-btn:hover:not(:disabled):not(.active) {
  color: #409eff;
  border-color: #c6e2ff;
  background: #ecf5ff;
}
/* 数字按钮正方形 */
.pg-btn--num { padding: 0; }
/* 当前激活页 */
.pg-btn.active {
  background: #409eff;
  border-color: #409eff;
  color: #fff;
  cursor: default;
}
/* 禁用态（上一页在第 1 页 / 下一页在最后页） */
.pg-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  background: #f5f7fa;
}

/* 跳至指定页 */
.pg-jump {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #606266;
}
.pg-input {
  width: 50px;
  height: 28px;
  padding: 0 6px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #fff;
  font-size: 13px;
  color: #606266;
  text-align: center;
}
.pg-input:focus { outline: none; border-color: #409eff; }
/* 干掉 number input 的上下箭头（不同浏览器不同属性） */
.pg-input::-webkit-inner-spin-button,
.pg-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.pg-input[type="number"] { -moz-appearance: textfield; }

/* ============ 响应式：手机简化 ============ */
@media (max-width: 768px) {
  .data-table { font-size: 12px; min-width: 720px; }
  .data-table thead th,
  .data-table tbody td { height: 40px; padding: 0 8px; }
  /* 隐藏次要列（邮箱最小宽度也 170px，先保留） */
  .cell-muted { display: none; }                  /* 隐藏创建时间 */
  .pg-jump { display: none; }                     /* 隐藏跳转输入框 */
  .pg-info { display: none; }                     /* 隐藏 "共 X 条"（底部空间有限） */
}
</style>
