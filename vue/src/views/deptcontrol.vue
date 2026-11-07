<script setup>
defineOptions({ name: 'DeptControl' })
/**
 * 组织架构页面
 *
 * 后端 API：
 *   GET    /api/departments?with_members=true —— 扁平数组 + 成员数 + 成员列表
 *   POST   /api/departments                    —— 新增部门
 *   PUT    /api/departments/:id                —— 编辑部门（含移动层级 + 改名称同步 users/tickets.dept）
 *   DELETE /api/departments/:id                —— 删除（有子部门或成员拒绝）
 *
 * 前端：
 *   1. 拉扁平数组 → 前端组 el-tree 结构
 *   2. el-tree + 右侧详情面板（成员列表 + 负责人）
 *   3. 新增/编辑弹窗（选择父级、选负责人）
 */
import { ref, computed, onMounted, onActivated, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request.js'

// ===== 状态 =====
const flatList = ref([])      // 后端原始扁平数组
const loading = ref(false)
const selectedDept = ref(null) // 当前选中的部门详情
const treeRef = ref(null)
const filterKeyword = ref('') // 部门树搜索关键词

// ===== 部门统计（业务口径） =====
// 总公司 = 根节点（parent_id 为 null）
// 部门 = 中层：有 leader 的非根节点
// 组 = 叶子：无子部门的节点
const rootDept = computed(() => flatList.value.find((d) => d.parentId == null) || null)
const deptList = computed(() => flatList.value.filter((d) => d.parentId != null && d.leaderId != null))
const groupList = computed(() => {
  const hasChildIds = new Set(flatList.value.filter((d) => flatList.value.some((c) => c.parentId === d.id)).map((d) => d.id))
  return flatList.value.filter((d) => !hasChildIds.has(d.id)) // 所有叶子 = 组
})
// 总"部门数"：业务口径 = 中层部门 + 根节点（总公司）—— 不含叶子组
const totalDeptCount = computed(() => deptList.value.length + (rootDept.value ? 1 : 0))
const totalGroupCount = computed(() => groupList.value.length)

// ===== 判断节点类型（用于图标） =====
// 规则：根节点(null)或挂在根下(parentId=根id) → 部门📁；其他 → 组📄
const rootId = computed(() => flatList.value.find((d) => d.parentId == null)?.id)
function nodeIcon(data) {
  if (data.parentId == null) return '🏢'                 // 根：总公司
  if (data.parentId === rootId.value) return '📁'        // 挂在总公司下：部门
  return '📄'                                            // 更深层级：组
}
const treeData = computed(() => buildTree(flatList.value))
function buildTree(list) {
  const map = new Map(list.map((d) => ({ ...d, children: [] })).map((d) => [d.id, d]))
  const roots = []
  for (const d of map.values()) {
    if (d.parentId && map.has(d.parentId)) {
      map.get(d.parentId).children.push(d)
    } else {
      roots.push(d)
    }
  }
  // 递归排序
  const sortTree = (arr) => {
    arr.sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.id - b.id)
    arr.forEach((n) => n.children && sortTree(n.children))
  }
  sortTree(roots)
  return roots
}

// ===== 加载 =====
async function loadList() {
  loading.value = true
  try {
    flatList.value = await request.get('/departments', { params: { with_members: 'true' } })
    // 选中保持
    if (selectedDept.value) {
      selectedDept.value = flatList.value.find((d) => d.id === selectedDept.value.id) || null
    } else if (flatList.value.length) {
      selectedDept.value = flatList.value[0]
    }
  } catch (e) {
    ElMessage.error('加载组织架构失败：' + (e?.message || e))
  } finally { loading.value = false }
}

// ===== 树节点选中 =====
// 关键：必须从 flatList 重新查找，不能直接用 el-tree 节点 data
// 因为 el-tree 内部可能做了浅拷贝，members 等嵌套数组字段会丢失
function onNodeClick(data) {
  selectedDept.value = flatList.value.find((d) => d.id === data.id) || data
}

// ===== 部门树搜索 =====
watch(filterKeyword, (v) => {
  treeRef.value?.filter(v || '')
})

// ===== 展开全部 =====
function expandAll() {
  const all = []
  const walk = (nodes) => {
    nodes.forEach((n) => { all.push(n.id); if (n.children?.length) walk(n.children) })
  }
  walk(treeData.value)
  treeRef.value?.setCurrentKey(selectedDept.value?.id)
  // el-tree 没有全局 expand-keys prop，用内部 store 或循环 setExpandedKeys
  treeRef.value?.store?.getAllNodes().forEach((n) => { n.expanded = true })
}

// ===== 所有用户（负责人下拉用，不分页全量）=====
const allUsers = ref([])
async function loadUsers() {
  try {
    // /users 现在是分页接口，传 pageSize=1000 拿全量，再从 { list, total } 里取 list
    const data = await request.get('/users', { params: { pageSize: 1000 } })
    allUsers.value = Array.isArray(data) ? data : (data?.list || [])
  } catch { allUsers.value = [] }
}
const leaderLabel = (id) => allUsers.value.find((u) => u.id === id)?.name || '—'

// ===== 新增 / 编辑 弹窗 =====
const showForm = ref(false)
const form = ref(null)    // { mode: 'add'|'edit', data: {...} }
const submitting = ref(false)

function openAddUnder() {
  // 在选中的部门下新增子部门
  form.value = {
    mode: 'add',
    parent: selectedDept.value,
    data: { name: '', parentId: selectedDept.value?.id || null, leaderId: null, sort: 0, status: '启用' },
  }
  showForm.value = true
}

function openEdit() {
  if (!selectedDept.value) return ElMessage.warning('请先选择一个部门')
  const d = selectedDept.value
  form.value = {
    mode: 'edit',
    data: { name: d.name, parentId: d.parentId || null, leaderId: d.leaderId || null, sort: d.sort, status: d.status },
    originalId: d.id,
  }
  showForm.value = true
}

async function submitForm() {
  const d = form.value?.data
  if (!d || !d.name?.trim()) return ElMessage.error('部门名称不能为空')
  submitting.value = true
  try {
    const payload = {
      name: d.name.trim(),
      parentId: d.parentId || null,
      leaderId: d.leaderId || null,
      sort: Number(d.sort) || 0,
      status: d.status || '启用',
    }
    if (form.value.mode === 'add') {
      await request.post('/departments', payload)
      ElMessage.success('部门已新增')
    } else {
      await request.put(`/departments/${form.value.originalId}`, payload)
      ElMessage.success('部门已更新')
    }
    showForm.value = false
    await loadList()
  } catch (e) {
    ElMessage.error('保存失败：' + (e?.message || e))
  } finally { submitting.value = false }
}

// ===== 删除 =====
async function handleDelete() {
  if (!selectedDept.value) return ElMessage.warning('请先选择一个部门')
  const d = selectedDept.value

  // 预检查：有子部门或有直接成员 → 阻止删除并提示
  const directMembers = d.members?.length || 0
  const childDeptCount = treeData.value ? countDescendantDepts(d) : 0

  if (childDeptCount > 0 || directMembers > 0) {
    const reasons = []
    if (childDeptCount > 0) reasons.push(`${childDeptCount} 个子部门`)
    if (directMembers > 0) reasons.push(`${directMembers} 名直接成员`)
    ElMessageBox.alert(
      `部门「${d.name}」无法删除：还有 ${reasons.join('，')}。<br/>` +
      `请先把子部门的成员调动到上级部门、删除空的子部门，再回来删除本部门。`,
      '删除受阻',
      { dangerouslyUseHTMLString: true, confirmButtonText: '我知道了', type: 'warning' },
    )
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定删除部门「${d.name}」？`,
      '危险操作',
      { type: 'error', confirmButtonText: '确认删除', confirmButtonClass: 'el-button--danger' },
    )
  } catch { return }

  try {
    await request.delete(`/departments/${d.id}`)
    ElMessage.success('已删除')
    await loadList()
  } catch {
    // request.js 拦截器已经弹过 ElMessage.error，这里不再重复
  }
}

// 递归统计子部门数量
function countDescendantDepts(node) {
  let n = 0
  const walk = (nodes) => {
    for (const c of nodes) { n++; if (c.children?.length) walk(c.children) }
  }
  walk(node.children || [])
  return n
}

// ===== 成员操作提示 =====
function tip(msg) { ElMessage.info(msg) }

onMounted(async () => { await Promise.all([loadList(), loadUsers()]) })
// keep-alive 缓存激活时刷新数据（避免旧状态导致成员列表为空）
onActivated(async () => { await loadList() })
</script>

<template>
  <div class="dept-control">
    <!-- 顶部工具栏 -->
    <el-card shadow="never" class="toolbar">
      <div class="toolbar-row">
        <h3 class="title">🏢 组织架构</h3>
        <div class="toolbar-actions">
          <el-button :loading="loading" @click="loadList">🔄 刷新</el-button>
          <el-button @click="expandAll">📂 全部展开</el-button>
          <el-button type="primary" @click="openAddUnder" :disabled="!treeData.length">➕ 新增子部门</el-button>
        </div>
      </div>
    </el-card>

    <!-- 主体两栏 -->
    <div class="body">
      <!-- 左：树形结构 -->
      <el-card shadow="never" class="tree-card">
        <template #header>
          <span class="card-header">🌳 部门树</span>
          <span class="card-subtitle">共 {{ deptList.length }} 个部门 · {{ groupList.length }} 个组</span>
        </template>
        <el-input v-model="filterKeyword" placeholder="搜索部门..." clearable class="search" />
        <el-tree
          ref="treeRef"
          :data="treeData"
          :props="{ children: 'children', label: 'name' }"
          :filter-node-method="(v, d) => !v || d.name.includes(v)"
          node-key="id"
          highlight-current
          default-expand-all
          @node-click="onNodeClick"
          class="dept-tree"
        >
          <template #default="{ node, data }">
            <div class="tree-node">
              <span class="node-icon">{{ nodeIcon(data) }}</span>
              <span class="node-name">{{ node.label }}</span>
              <el-tag size="small" effect="plain" type="info" class="count-badge">
                {{ data.memberCount || 0 }}
              </el-tag>
            </div>
          </template>
        </el-tree>
      </el-card>

      <!-- 右：详情面板 -->
      <el-card shadow="never" class="detail-card">
        <template #header>
          <div class="detail-header">
            <div>
              <span class="card-header">📋 部门详情</span>
              <span v-if="selectedDept" class="dept-title">
                「{{ selectedDept.name }}」
                <el-tag size="small" effect="dark" :type="selectedDept.status === '启用' ? 'success' : 'info'">
                  {{ selectedDept.status }}
                </el-tag>
              </span>
            </div>
            <div class="detail-actions" v-if="selectedDept">
              <el-button size="small" type="primary" @click="openEdit">✏️ 编辑</el-button>
              <el-button size="small" @click="openAddUnder">➕ 子部门</el-button>
              <el-button size="small" type="danger" @click="handleDelete">🗑️ 删除</el-button>
            </div>
          </div>
        </template>

        <!-- 没选中 -->
        <el-empty v-if="!selectedDept" description="请点击左侧部门查看详情" />

        <div v-else class="detail-body">
          <!-- 基础信息 -->
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="部门 ID">{{ selectedDept.id }}</el-descriptions-item>
            <el-descriptions-item label="部门名称">{{ selectedDept.name }}</el-descriptions-item>
            <el-descriptions-item label="上级部门">
              {{ flatList.find(d => d.id === selectedDept.parentId)?.name || '（根部门）' }}
            </el-descriptions-item>
            <el-descriptions-item label="排序">{{ selectedDept.sort }}</el-descriptions-item>
            <el-descriptions-item label="负责人">{{ leaderLabel(selectedDept.leaderId) }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{ selectedDept.status }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ selectedDept.createdAt }}</el-descriptions-item>
            <el-descriptions-item label="更新时间">{{ selectedDept.updatedAt }}</el-descriptions-item>
          </el-descriptions>

          <!-- 成员列表 -->
          <div class="members-section">
            <div class="section-title">
              👥 部门成员
              <el-tag size="small" effect="dark">{{ selectedDept.members?.length || 0 }} 人</el-tag>
              <el-button
                type="primary" link size="small"
                @click="tip('跳到用户管理页面，将用户部门改为「' + selectedDept.name + '」即可调岗')"
              >+ 新增成员（去用户管理）</el-button>
            </div>
            <el-table :data="selectedDept.members || []" size="small" stripe border style="margin-top:6px">
              <el-table-column prop="id" label="ID" width="60" />
              <el-table-column prop="username" label="账号" width="120" />
              <el-table-column prop="name" label="姓名" width="100" />
              <el-table-column prop="role" label="角色" width="140">
                <template #default="{ row }">
                  <el-tag size="small" type="warning" effect="plain">{{ row.role }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="90">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.status === '启用' ? 'success' : 'info'">{{ row.status }}</el-tag>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-if="!selectedDept.members?.length" :image-size="50" description="暂无成员" />
          </div>
        </div>
      </el-card>
    </div>

    <!-- ===== 新增 / 编辑 弹窗 ===== -->
    <el-dialog
      v-model="showForm"
      :title="form?.mode === 'add' ? '➕ 新增部门' : '✏️ 编辑部门'"
      width="520px"
      destroy-on-close
    >
      <el-form v-if="form" :model="form.data" label-width="100px">
        <el-form-item label="部门名称">
          <el-input v-model="form.data.name" placeholder="如：产品组" />
        </el-form-item>
        <el-form-item label="上级部门">
          <el-tree-select
            v-model="form.data.parentId"
            :data="treeData"
            :props="{ value: 'id', label: 'name', children: 'children' }"
            clearable
            placeholder="根部门（无上级）"
            style="width:100%"
          />
        </el-form-item>
        <el-form-item label="部门负责人">
          <el-select v-model="form.data.leaderId" clearable placeholder="未指定" style="width:100%">
            <el-option
              v-for="u in allUsers"
              :key="u.id"
              :label="`${u.name} (${u.username})`"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.data.sort" :min="0" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.data.status">
            <el-radio value="启用">启用</el-radio>
            <el-radio value="停用">停用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showForm = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
export default { name: 'DeptControl' }
</script>

<style scoped>
.dept-control { display:flex; flex-direction:column; gap:12px; min-height:620px; }
.toolbar, .tree-card, .detail-card { border-radius:8px; }

.toolbar-row { display:flex; justify-content:space-between; align-items:center; }
.title { margin:0; font-size:16px; color:#14487e; }
.toolbar-actions { display:flex; gap:8px; }

.body { display:flex; gap:12px; flex:1; min-height:0; }
.tree-card { width: 340px; flex-shrink:0; display:flex; flex-direction:column; }
.detail-card { flex:1; min-width:0; }

.card-header { font-weight:600; color:#14487e; font-size:14px; }
.card-subtitle { margin-left:8px; font-size:12px; color:#909399; }

.search { margin-bottom:10px; }
.dept-tree { flex:1; overflow:auto; padding:6px 0; }
.tree-node { display:flex; align-items:center; gap:6px; flex:1; font-size:14px; }
.node-icon { font-size:14px; }
.node-name { flex:1; }
.count-badge { margin-left:auto; }

.detail-header { display:flex; justify-content:space-between; align-items:center; gap:12px; }
.dept-title { margin-left:10px; font-size:14px; font-weight:500; color:#303133; }
.detail-actions { display:flex; gap:6px; }

.detail-body { display:flex; flex-direction:column; gap:16px; }

.members-section { border-top:1px solid #ebeef5; padding-top:12px; }
.section-title { font-size:14px; font-weight:600; color:#606266; display:flex; align-items:center; gap:8px; }
.section-title .el-tag { margin-left:auto; }
</style>
