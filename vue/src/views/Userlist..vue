<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Delete, Edit, Key, Plus, Refresh, Search, SwitchButton, View } from '@element-plus/icons-vue'
import { DEPT_OPTIONS } from '@/mock/data'
import { ROLE_OPTIONS, ROLE_TAG_TYPE, USER_STATUS_TAG_TYPE } from '@/mock/users'
import { listUsers, createUser, updateUser, toggleUserStatus, resetUserPassword, deleteUser } from '@/api/user'
import { currentUserInfo } from '@/utils/helpers'

const route = useRoute()
const router = useRouter()

// 用户写操作（增删改/启禁/重置密码）后端仅超管可调，前端隐藏入口保持一致；部长本部门只读
const isAdmin = computed(() => currentUserInfo()?.role === '超级管理员')

// ============ 列表数据 ============
const users = ref([])
const loading = ref(false)

// ============ 查询条件 ============
const queryForm = reactive({
  keyword: '',
  role: '',
  status: '',
})

const applied = reactive({
  keyword: '',
  role: '',
  status: '',
  page: 1,
  pageSize: 10,
})

// 当前页数据（筛选在后端做，分页在前端）
const pagedUsers = ref([])

async function loadList() {
  loading.value = true
  try {
    const params = {}
    if (applied.keyword) params.keyword = applied.keyword
    if (applied.role) params.role = applied.role
    if (applied.status) params.status = applied.status
    users.value = await listUsers(params)
    // 分页在前端（规格 §8 约定：分页排序由前端做）
    const start = (applied.page - 1) * applied.pageSize
    pagedUsers.value = users.value.slice(start, start + applied.pageSize)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  Object.assign(applied, {
    keyword: queryForm.keyword.trim(),
    role: queryForm.role,
    status: queryForm.status,
    page: 1,
  })
  loadList()
}

const handleReset = () => {
  Object.assign(queryForm, { keyword: '', role: '', status: '' })
  Object.assign(applied, { keyword: '', role: '', status: '', page: 1, pageSize: 10 })
  loadList()
}

const handlePageChange = (page) => {
  applied.page = page
  const start = (page - 1) * applied.pageSize
  pagedUsers.value = users.value.slice(start, start + applied.pageSize)
}
const handleSizeChange = (size) => {
  applied.pageSize = size
  applied.page = 1
  pagedUsers.value = users.value.slice(0, size)
}

// ============ 新增 / 编辑弹窗 ============
const dialogVisible = ref(false)
const dialogMode = ref('add')
const formRef = ref()
const form = reactive({
  id: null,
  username: '',
  name: '',
  role: '',
  dept: '',
  email: '',
})

const rules = {
  username: [
    { required: true, message: '请输入账号', trigger: 'blur' },
    { min: 3, message: '账号至少 3 位', trigger: 'blur' },
  ],
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  // 超级管理员可不属于任何部门（与后端校验一致），其余角色必选
  dept: [
    {
      validator: (r, v, cb) => (form.role === '超级管理员' || v ? cb() : cb(new Error('请选择部门'))),
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
  Object.assign(form, {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    dept: row.dept,
    email: row.email,
  })
  dialogVisible.value = true
}

const handleSubmit = async () => {
  try {
    await formRef.value.validate()
  } catch {
    ElMessage.error('请完善必填信息')
    return
  }
  try {
    // 超管允许不选部门 → 提交 null（后端对超管放行无部门）
    const dept = form.role === '超级管理员' ? form.dept || null : form.dept
    if (dialogMode.value === 'add') {
      await createUser({
        username: form.username.trim().toLowerCase(),
        name: form.name.trim(),
        role: form.role,
        dept,
        email: form.email?.trim() || null,
      })
      ElMessage.success('用户创建成功')
    } else {
      await updateUser(form.id, {
        name: form.name.trim(),
        role: form.role,
        dept,
        email: form.email?.trim() || null,
      })
      ElMessage.success('用户修改成功')
    }
    dialogVisible.value = false
    loadList()
  } catch {
    // 错误提示由响应拦截器统一弹出（如「用户名已存在」「邮箱格式不正确」）
  }
}

// ============ 启用 / 禁用 ============
const handleToggle = (row) => {
  const action = row.status === '启用' ? '禁用' : '启用'
  ElMessageBox.confirm(
    `确定要${action}用户「${row.name}」吗？${action === '禁用' ? '禁用后该用户将无法登录。' : ''}`,
    `${action}用户`,
    { confirmButtonText: `确定${action}`, cancelButtonText: '取消', type: 'warning' },
  )
    .then(async () => {
      await toggleUserStatus(row.id, action)
      ElMessage.success(`已${action}用户 ${row.name}`)
      loadList()
    })
    .catch(() => { })
}

// ============ 重置密码 ============
const handleResetPwd = (row) => {
  ElMessageBox.confirm(`确定要将「${row.name}」的密码重置为默认密码 123456 吗？`, '重置密码', {
    confirmButtonText: '重置',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      await resetUserPassword(row.id)
      ElMessage.success(`用户 ${row.name} 的密码已重置为 123456`)
    })
    .catch(() => { })
}

// ============ 删除 ============
const handleDelete = (row) => {
  ElMessageBox.confirm(`确定要删除用户「${row.name}」吗？删除后不可恢复。`, '删除用户', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    confirmButtonType: 'danger',
  })
    .then(async () => {
      await deleteUser(row.id)
      ElMessage.success(`用户 ${row.name} 已删除`)
      // 删除后重新加载，当前页如果删光了回退一页
      if (pagedUsers.value.length === 1 && applied.page > 1) applied.page -= 1
      loadList()
    })
    .catch(() => { })
}

// 查看详情 → 跳转详情页
const goDetail = (row) => router.push(`/usercontrol/${row.id}`)

// 从工单列表点击提交人跳过来时，按姓名预筛选
watch(
  () => route.query.submitter,
  (name) => {
    if (name) {
      queryForm.keyword = name
      applied.keyword = name
      applied.page = 1
      loadList()
    }
  },
  { immediate: true },
)

onMounted(loadList)
</script>

<template>
  <div class="user-list">
    <!-- 查询区域 -->
    <el-card shadow="never" class="search-card">
      <el-form :model="queryForm" inline>
        <el-form-item label="账号 / 姓名">
          <el-input v-model="queryForm.keyword" placeholder="账号或姓名" clearable style="width: 180px"
            @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="queryForm.role" placeholder="全部" clearable style="width: 140px">
            <el-option v-for="r in ROLE_OPTIONS" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="queryForm.status" placeholder="全部" clearable style="width: 110px">
            <el-option label="启用" value="启用" />
            <el-option label="禁用" value="禁用" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 表格区域 -->
    <el-card shadow="never" class="table-card">
      <div class="table-toolbar">
        <span class="table-title">用户列表（{{ users.length }}）</span>
        <div>
          <el-button text size="small" :icon="Refresh" @click="loadList">刷新</el-button>
          <el-button v-if="isAdmin" type="primary" :icon="Plus" @click="openAdd">新增用户</el-button>
        </div>
      </div>

      <el-table :data="pagedUsers" v-loading="loading" border stripe style="width: 100%">
        <el-table-column prop="username" label="账号" width="130" />
        <el-table-column prop="name" label="姓名" width="90" />
        <el-table-column label="角色" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="ROLE_TAG_TYPE[row.role]" size="small">{{ row.role }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="所属部门" width="100">
          <template #default="{ row }">{{ row.dept || '—' }}</template>
        </el-table-column>
        <el-table-column prop="email" label="邮箱" min-width="170" show-overflow-tooltip />
        <el-table-column label="状态" width="80" align="center">
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
              <el-button text :type="row.status === '启用' ? 'warning' : 'success'" size="small" :icon="SwitchButton"
                @click="handleToggle(row)">
                {{ row.status === '启用' ? '禁用' : '启用' }}
              </el-button>
              <el-button text type="info" size="small" :icon="Key" @click="handleResetPwd(row)">
                重置密码
              </el-button>
              <el-button text type="danger" size="small" :icon="Delete" @click="handleDelete(row)">删除</el-button>
            </template>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="没有符合条件的用户" :image-size="80" />
        </template>
      </el-table>

      <div class="pagination">
        <el-pagination background layout="total, sizes, prev, pager, next, jumper" :total="users.length"
          :current-page="applied.page" :page-size="applied.pageSize" :page-sizes="[5, 10, 20]"
          @current-change="handlePageChange" @size-change="handleSizeChange" />
      </div>
    </el-card>

    <!-- 新增 / 编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="dialogMode === 'add' ? '新增用户' : '编辑用户'" width="480px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="账号" prop="username">
          <el-input v-model="form.username" placeholder="登录账号" :disabled="dialogMode === 'edit'" />
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="form.name" placeholder="用户姓名" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" placeholder="请选择角色" style="width: 100%">
            <el-option v-for="r in ROLE_OPTIONS" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="部门" prop="dept">
          <el-select v-model="form.dept" placeholder="请选择部门" style="width: 100%">
            <el-option v-for="d in DEPT_OPTIONS" :key="d" :label="d" :value="d" />
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

.table-title {
  font-size: 16px;
  font-weight: 600;
  color: #14487e;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
