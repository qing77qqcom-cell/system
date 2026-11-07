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
 */
import { computed, onMounted, onActivated, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Delete, Edit, Key, Plus, Refresh, Search, SwitchButton, View, Filter, ArrowDown, ArrowUp } from '@element-plus/icons-vue'
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
// 完整 departments 树（带 parentId + 子部门），供左侧 el-tree 用
const deptTree = ref([])
async function loadDepts() {
  try {
    const list = await request.get('/departments')
    // 前端组树：扁平数组 → 嵌套 children
    const map = new Map((list || []).map((d) => ({ ...d, children: [] })).map((d) => [d.id, d]))
    const roots = []
    for (const d of map.values()) {
      if (d.parentId && map.has(d.parentId)) map.get(d.parentId).children.push(d)
      else roots.push(d)
    }
    const sortTree = (arr) => { arr.sort((a, b) => (a.sort || 0) - (b.sort || 0)); arr.forEach((n) => n.children && sortTree(n.children)) }
    sortTree(roots)
    // 在最前面加一个虚拟"全部"节点，所有真实部门作为它的子节点
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

// 三个独立快捷筛选值（左侧 el-collapse 菜单和右侧工具栏下拉都绑定这里，双向同步）
const selRole = ref('')  // ''=全部
const selDept = ref('')
const selStatus = ref('')

// 高级筛选面板展开/折叠
const showAdv = ref(true)

// 已应用筛选（用于底部标签区展示 + 单个清除）
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

// 左侧分类折叠状态（全展开）
const collapsedNames = ref(['role', 'dept', 'status'])

// 关键词 + 高级筛选
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

// 左侧菜单点击 → 设值 → 拉数据（多条件叠加）
const setFilter = (field, val) => {
  if (field === 'role')    selRole.value    = val
  if (field === 'dept')    selDept.value    = val
  if (field === 'status')  selStatus.value  = val
  pagination.page = 1
  loadList()
}

// 左侧部门树点击 → dept 是部门名，空字符串代表全部
function onDeptTreeClick(data) {
  selDept.value = data.id === 'all' ? '' : data.name
  pagination.page = 1
  loadList()
}

// 获取某个部门及其所有子孙的名字（用于后端按 dept IN (...) 查）
// 但后端 dept 参数是单个字符串，这里先取直接名字，递归支持后面加
function getAllDeptNames(node, names = []) {
  if (node.id !== 'all') names.push(node.name)
  if (node.children) node.children.forEach((c) => getAllDeptNames(c, names))
  return names
}

// 计算当前 selDept 对应的"要查的部门名列表"（递归含子部门）
const deptParam = computed(() => selDept.value || '')

// 从 deptTree 递归提取所有部门名字（供右侧工具栏 select 用）
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
const handlePageChange = (p) => { pagination.page = p; loadList() }
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
        <!-- ① 用户类型 -->
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

        <!-- ② 所属部门（树形结构，和 deptcontrol.vue 一致） -->
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
          >
            <template #default="{ data }">
              <span class="tree-node-label">{{ data.name }}</span>
            </template>
          </el-tree>
        </el-collapse-item>

        <!-- ③ 账号状态 -->
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
      <!-- 关键词 + 操作栏 -->
      <el-card shadow="never" class="toolbar-card">
        <!-- 第一行：关键词 + 操作 -->
        <div class="toolbar-row">
          <el-input
            v-model="keyword"
            placeholder="按账号 / 姓名 / 邮箱模糊搜索"
            clearable
            style="width: 260px"
            @keyup.enter="applyKeyword"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-button type="primary" :icon="Search" @click="applyKeyword">搜索</el-button>
          <el-button :icon="Filter" @click="showAdv = !showAdv">
            筛选
            <el-icon style="margin-left:4px"><ArrowDown v-if="!showAdv" /><ArrowUp v-else /></el-icon>
          </el-button>

          <div class="toolbar-right">
            <el-tag type="info" effect="plain" round>共 {{ total }} 条</el-tag>
            <el-button text size="small" :icon="Refresh" @click="loadList">刷新</el-button>
            <el-button v-if="isAdmin" type="primary" :icon="Plus" @click="openAdd">新增用户</el-button>
          </div>
        </div>

        <!-- 第二行：高级筛选（可折叠） -->
        <div v-show="showAdv" class="toolbar-adv">
          <div class="adv-row">
            <span class="adv-label">用户类型：</span>
            <el-select v-model="selRole" clearable placeholder="全部" style="width:140px" @change="loadList">
              <el-option v-for="r in ROLE_OPTIONS" :key="r.value" :label="r.label" :value="r.value" />
            </el-select>

            <span class="adv-label">所属部门：</span>
            <el-select v-model="selDept" clearable filterable placeholder="全部" style="width:160px" @change="loadList">
              <el-option v-for="d in allDeptNames" :key="d" :label="d" :value="d" />
            </el-select>

            <span class="adv-label">账号状态：</span>
            <el-select v-model="selStatus" clearable placeholder="全部" style="width:140px" @change="loadList">
              <el-option v-for="s in STATUS_OPTIONS" :key="s.value" :label="s.label" :value="s.value" />
            </el-select>

            <el-button text size="small" @click="resetAll">清空全部</el-button>
          </div>

          <!-- 已应用筛选标签区 -->
          <div v-if="activeFilters.length" class="active-filters">
            <span class="adv-label">已筛选：</span>
            <el-tag
              v-for="f in activeFilters"
              :key="f.key"
              closable
              size="small"
              type="warning"
              effect="plain"
              @close="clearFilter(f.key)"
            >{{ f.label }} = {{ f.value }}</el-tag>
          </div>
        </div>
      </el-card>

      <!-- 表格 -->
      <el-card shadow="never" class="table-card">
        <el-table :data="rows" v-loading="loading" border stripe style="width: 100%">
          <el-table-column prop="username" label="账号" width="130" />
          <el-table-column prop="name" label="姓名" width="90" />
          <el-table-column label="用户类型" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="ROLE_TAG_TYPE[row.role]" size="small">{{ ROLE_LABELS[row.role] || row.role }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="所属部门" width="110">
            <template #default="{ row }">{{ row.dept || '—' }}</template>
          </el-table-column>
          <el-table-column prop="email" label="邮箱" min-width="170" show-overflow-tooltip />
          <el-table-column label="账号状态" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="USER_STATUS_TAG_TYPE[row.status]" size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="160" />
          <el-table-column label="操作" :width="isAdmin ? 300 : 80" fixed="right" align="center">
            <template #default="{ row }">
              <el-button text type="primary" size="small" :icon="View" @click="goDetail(row)">详情</el-button>
              <template v-if="isAdmin">
                <el-button text type="primary" size="small" :icon="Edit" @click="openEdit(row)">编辑</el-button>
                <el-button text :type="row.status === '启用' ? 'warning' : 'success'" size="small" :icon="SwitchButton" @click="handleToggle(row)">
                  {{ row.status === '启用' ? '禁用' : '启用' }}
                </el-button>
                <el-button text type="info" size="small" :icon="Key" @click="handleResetPwd(row)">重置密码</el-button>
                <el-button text type="danger" size="small" :icon="Delete" @click="handleDelete(row)">删除</el-button>
              </template>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="没有符合条件的用户" :image-size="80" />
          </template>
        </el-table>

        <div class="pagination">
          <el-pagination background layout="total, sizes, prev, pager, next, jumper"
            :total="total" :current-page="pagination.page" :page-size="pagination.pageSize"
            :page-sizes="[5, 10, 20, 50]"
            @current-change="handlePageChange" @size-change="handleSizeChange" />
        </div>
      </el-card>
    </div>

    <!-- ========== 新增 / 编辑弹窗 ========== -->
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

/* 左侧：可折叠的三个分类快捷筛选 */
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
.tree-node-label { font-size: 13px; }

.main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }

.toolbar-card, .table-card { border-radius: 10px; border: none; box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06); }

.toolbar-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.toolbar-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }

.toolbar-adv {
  margin-top: 12px; padding-top: 12px;
  border-top: 1px dashed #e4e7ed;
  display: flex; flex-direction: column; gap: 10px;
}
.adv-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.adv-label { font-size: 13px; color: #606266; white-space: nowrap; }

.active-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.active-filters .el-tag { max-width: 200px; }

.pagination { display: flex; justify-content: flex-end; margin-top: 14px; }
</style>
