<script setup>
defineOptions({ name: 'RoleList' })
/**
 * 角色与权限管理
 * 三标签页：
 *   ① 角色列表 —— 新增/编辑/启停/删除角色
 *   ② 菜单权限 —— 选角色 → el-tree 勾选菜单权限码（type='menu'）→ 保存
 *   ③ 按钮权限 —— 选角色 → 按权限码分组 checkbox 矩阵（type='button'）→ 保存
 *
 * 后端 API：
 *   GET    /api/roles                      → 所有角色
 *   POST   /api/roles                      → 新增
 *   PUT    /api/roles/:id                  → 编辑
 *   DELETE /api/roles/:id                  → 删除
 *   GET    /api/roles/:id/permissions      → 某角色当前权限
 *   PUT    /api/roles/:id/permissions      → 覆盖式保存（前端传全量数组）
 *   GET    /api/roles/permission-codes     → 权限码字典（5 groups × 31 items）
 */
import { computed, onMounted, onActivated, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request.js'

// ============ Tab 切换 ============
const activeTab = ref('roles') // roles | menu | button

// ============ 全局数据源 ============
const roles = ref([])
const catalog = ref({ groups: [] }) // 权限码字典

// 按 type 分组的 items（后端 PERMISSION_CATALOG 里每个 item 都有 type 字段）
const menuGroups = computed(() => catalog.value.groups.map(g => ({
  ...g,
  items: g.items.filter(i => i.type === 'menu'),
})).filter(g => g.items.length))

const buttonGroups = computed(() => catalog.value.groups.map(g => ({
  ...g,
  items: g.items.filter(i => i.type === 'button'),
})).filter(g => g.items.length))

const allMenuCodes = computed(() => menuGroups.value.flatMap(g => g.items.map(i => i.key)))
const allButtonCodes = computed(() => buttonGroups.value.flatMap(g => g.items.map(i => i.key)))

const loadAll = async () => {
  const [r, c] = await Promise.all([
    request.get('/roles'),
    request.get('/roles/permission-codes'),
  ])
  roles.value = r
  catalog.value = c
}

// =====================================================
// Tab ①：角色列表
// =====================================================
const dialogVisible = ref(false)
const dialogMode = ref('add')
const formRef = ref()
const form = reactive({ id: null, code: '', name: '', description: '', sort: 99, active: true })

const openAdd = () => {
  dialogMode.value = 'add'
  Object.assign(form, { id: null, code: '', name: '', description: '', sort: 99, active: true })
  dialogVisible.value = true
}
const openEdit = (row) => {
  dialogMode.value = 'edit'
  Object.assign(form, { id: row.id, code: row.code, name: row.name, description: row.description || '', sort: row.sort, active: row.active })
  dialogVisible.value = true
}

const saveRole = async () => {
  if (!form.name.trim()) { ElMessage.error('角色名称必填'); return }
  if (dialogMode.value === 'add') {
    if (!form.code.trim() || !/^[a-z][a-z0-9_]{1,30}$/.test(form.code)) {
      ElMessage.error('编码仅限小写字母/数字/下划线（2-30 位）'); return
    }
  }
  try {
    if (dialogMode.value === 'add') {
      await request.post('/roles', { code: form.code.trim().toLowerCase(), name: form.name.trim(), description: form.description?.trim(), sort: Number(form.sort), active: form.active })
      ElMessage.success('角色新增成功')
    } else {
      await request.put(`/roles/${form.id}`, { name: form.name.trim(), description: form.description?.trim(), sort: Number(form.sort), active: form.active })
      ElMessage.success('角色修改成功')
    }
    dialogVisible.value = false
    await loadAll()
  } catch { /* 拦截器提示 */ }
}

const toggleRoleActive = async (row) => {
  const label = row.active ? '停用' : '启用'
  ElMessageBox.confirm(`确定要${label}角色「${row.name}」吗？${label === '停用' ? '停用后持该角色的用户将无法登录系统设置模块。' : ''}`,
    `${label}角色`, { confirmButtonText: `确定${label}`, cancelButtonText: '取消', type: 'warning' })
    .then(async () => {
      await request.put(`/roles/${row.id}`, { name: row.name, description: row.description, sort: row.sort, active: !row.active })
      ElMessage.success(`已${label}角色 ${row.name}`)
      await loadAll()
    }).catch(() => { })
}

const deleteRole = async (row) => {
  ElMessageBox.confirm(`确定要删除角色「${row.name}」吗？内置角色禁止删除，持有该角色的用户需先调岗。`, '删除角色',
    { confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonType: 'danger' })
    .then(async () => {
      await request.delete(`/roles/${row.id}`)
      ElMessage.success(`角色 ${row.name} 已删除`)
      await loadAll()
    }).catch(() => { })
}

// =====================================================
// Tab ②③：权限配置（菜单 + 按钮 用同一套 state）
// =====================================================
const selRoleId = ref(null)
const selRole = computed(() => roles.value.find(r => r.id === selRoleId.value))
const checkedPerms = ref([]) // 当前勾选的权限码（数组）

const loadPerms = async () => {
  if (!selRoleId.value) { checkedPerms.value = []; return }
  try {
    const data = await request.get(`/roles/${selRoleId.value}/permissions`)
    checkedPerms.value = data.permissions || []
  } catch { checkedPerms.value = [] }
}

// el-tree v-model 用 key 数组
const checkedMenuKeys = computed({
  get: () => checkedPerms.value.filter(k => allMenuCodes.value.includes(k)),
  set: (v) => {
    const btn = checkedPerms.value.filter(k => allButtonCodes.value.includes(k))
    checkedPerms.value = [...btn, ...v]
  },
})
const checkedButtonKeys = computed({
  get: () => checkedPerms.value.filter(k => allButtonCodes.value.includes(k)),
  set: (v) => {
    const menu = checkedPerms.value.filter(k => allMenuCodes.value.includes(k))
    checkedPerms.value = [...menu, ...v]
  },
})

// 辅助：菜单树勾选 → 生成带父子层级 key 的树结构（type 字段筛 menu）
const menuTreeData = computed(() => menuGroups.value.map(g => ({
  id: g.group, label: g.group, children: g.items.map(i => ({ id: i.key, label: i.label, leaf: true })),
})))

// 全选/全不选菜单
const selectAllMenu = () => { checkedMenuKeys.value = allMenuCodes.value }
const clearMenu = () => { checkedMenuKeys.value = [] }
// 按组全选按钮
const selectGroupButtons = (groupItems) => {
  const current = checkedButtonKeys.value.filter(k => !groupItems.some(i => i.key === k))
  const hasAll = groupItems.every(i => checkedButtonKeys.value.includes(i.key))
  checkedButtonKeys.value = hasAll ? current : [...current, ...groupItems.map(i => i.key)]
}

const savePerms = async () => {
  if (!selRoleId.value) { ElMessage.warning('请先选择一个角色'); return }
  try {
    await request.put(`/roles/${selRoleId.value}/permissions`, { permissions: checkedPerms.value })
    ElMessage.success(`已保存 ${checkedPerms.value.length} 个权限到角色「${selRole.value.name}」`)
  } catch { /* 拦截器提示 */ }
}

onMounted(async () => { await loadAll() })
onActivated(async () => { await loadAll() })
</script>

<template>
  <div class="role-perm-page">
    <el-card shadow="never" class="main-card">
      <el-tabs v-model="activeTab" class="main-tabs">
        <!-- ==================== Tab ① 角色列表 ==================== -->
        <el-tab-pane label="角色列表" name="roles">
          <div class="toolbar">
            <div class="tip-text">共 {{ roles.length }} 个角色 · 内置三角色不可删除</div>
            <el-button type="primary" size="small" :disabled="activeTab !== 'roles'" @click="openAdd">➕ 新增角色</el-button>
          </div>
          <el-table :data="roles" border stripe style="width: 100%">
            <el-table-column prop="code" label="角色编码" width="140" />
            <el-table-column prop="name" label="角色名称" width="140" />
            <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">{{ row.description || '—' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.active ? 'success' : 'info'" size="small">{{ row.active ? '启用' : '停用' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="内置" width="80" align="center">
              <template #default="{ row }">
                <el-tag v-if="['admin','leader','staff'].includes(row.code)" size="small" type="warning">内置</el-tag>
                <span v-else class="muted">自定义</span>
              </template>
            </el-table-column>
            <el-table-column prop="updatedAt" label="更新时间" width="160" />
            <el-table-column label="操作" width="260" fixed="right" align="center">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="activeTab='menu'; selRoleId=row.id; setTimeout(loadPerms,0)">配权限</el-button>
                <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
                <el-button text :type="row.active ? 'warning' : 'success'" size="small" @click="toggleRoleActive(row)">
                  {{ row.active ? '停用' : '启用' }}
                </el-button>
                <el-button text type="danger" size="small" :disabled="['admin','leader','staff'].includes(row.code)" @click="deleteRole(row)">删除</el-button>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty description="暂无角色" :image-size="80" />
            </template>
          </el-table>
        </el-tab-pane>

        <!-- ==================== Tab ② 菜单权限 ==================== -->
        <el-tab-pane label="菜单权限" name="menu">
          <div class="perm-layout">
            <div class="perm-role-picker">
              <el-form-item label="选择角色">
                <el-select v-model="selRoleId" placeholder="请选择角色" style="width: 100%" @change="loadPerms">
                  <el-option v-for="r in roles" :key="r.id" :label="`${r.name}（${r.code}）`" :value="r.id" />
                </el-select>
              </el-form-item>
              <div v-if="selRole" class="perm-summary">
                <div>当前勾选：<b>{{ checkedMenuKeys.length + checkedButtonKeys.length }}</b> / {{ allMenuCodes.length + allButtonCodes.length }}</div>
                <div class="muted">菜单 {{ checkedMenuKeys.length }} · 按钮 {{ checkedButtonKeys.length }}</div>
              </div>
              <div class="perm-actions">
                <el-button size="small" :disabled="!selRoleId" @click="selectAllMenu">全选菜单</el-button>
                <el-button size="small" :disabled="!selRoleId" @click="clearMenu">清空菜单</el-button>
                <el-button type="primary" size="small" :disabled="!selRoleId" @click="savePerms">💾 保存权限</el-button>
              </div>
            </div>

            <div class="perm-tree-area" v-if="selRole">
              <div class="perm-area-title">菜单权限（共 {{ allMenuCodes.length }} 项）</div>
              <el-tree
                ref="menuTree"
                :data="menuTreeData"
                show-checkbox
                node-key="id"
                :default-checked-keys="checkedMenuKeys"
                :check-strictly="false"
                class="perm-tree"
                @check="(n, { checkedKeys }) => { checkedMenuKeys = checkedKeys }"
              />
            </div>
            <el-empty v-else description="请在左侧选择要配置的角色" />
          </div>
        </el-tab-pane>

        <!-- ==================== Tab ③ 按钮权限 ==================== -->
        <el-tab-pane label="按钮权限" name="button">
          <div class="perm-layout">
            <div class="perm-role-picker">
              <el-form-item label="选择角色">
                <el-select v-model="selRoleId" placeholder="请选择角色" style="width: 100%" @change="loadPerms">
                  <el-option v-for="r in roles" :key="r.id" :label="`${r.name}（${r.code}）`" :value="r.id" />
                </el-select>
              </el-form-item>
              <div v-if="selRole" class="perm-summary">
                <div>当前勾选：<b>{{ checkedButtonKeys.length }}</b> / {{ allButtonCodes.length }}</div>
              </div>
              <div class="perm-actions">
                <el-button type="primary" size="small" :disabled="!selRoleId" @click="savePerms">💾 保存权限</el-button>
              </div>
            </div>

            <div class="perm-tree-area" v-if="selRole">
              <div class="perm-area-title">按钮权限（共 {{ allButtonCodes.length }} 项，按分组勾选）</div>
              <div v-for="g in buttonGroups" :key="g.group" class="button-group">
                <div class="button-group-header">
                  <el-tag type="primary" effect="plain" round>{{ g.group }}</el-tag>
                  <span class="muted group-count">{{ g.items.filter(i => checkedButtonKeys.includes(i.key)).length }} / {{ g.items.length }}</span>
                  <el-button text size="small" @click="selectGroupButtons(g.items)">切换全选</el-button>
                </div>
                <el-checkbox-group v-model="checkedButtonKeys" class="button-checkboxes">
                  <el-checkbox v-for="i in g.items" :key="i.key" :value="i.key" :label="i.key">
                    {{ i.label }}
                  </el-checkbox>
                </el-checkbox-group>
              </div>
            </div>
            <el-empty v-else description="请在左侧选择要配置的角色" />
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 新增 / 编辑角色弹窗 -->
    <el-dialog v-model="dialogVisible" :title="dialogMode === 'add' ? '新增角色' : '编辑角色'" width="480px" destroy-on-close>
      <el-form ref="formRef" :model="form" label-width="90px">
        <el-form-item label="角色编码">
          <el-input v-model="form.code" :disabled="dialogMode === 'edit'" placeholder="小写字母/数字/下划线，如 finance" />
          <div v-if="dialogMode === 'add'" class="form-tip">唯一标识，创建后不可改</div>
        </el-form-item>
        <el-form-item label="角色名称">
          <el-input v-model="form.name" placeholder="如 财务专员" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="角色职责说明（可选）" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="999" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.active" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRole">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.role-perm-page .main-card { border-radius: 10px; border: none; box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06); padding: 0 16px 16px; }
.role-perm-page .main-tabs { padding-top: 8px; }
.tip-text { font-size: 13px; color: #909399; }

.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }

.muted { color: #909399; font-size: 12px; }

/* 权限配置公共布局 */
.perm-layout { display: flex; gap: 20px; min-height: 400px; }
.perm-role-picker { width: 240px; flex-shrink: 0; display: flex; flex-direction: column; gap: 12px; padding: 12px; background: #f8fafc; border-radius: 8px; }
.perm-role-picker .el-form-item { margin-bottom: 0; }
.perm-summary { padding: 8px 0; border-top: 1px solid #e4e7ed; font-size: 13px; }
.perm-summary b { color: #14487e; }
.perm-actions { display: flex; flex-direction: column; gap: 6px; }

.perm-tree-area { flex: 1; min-width: 0; padding: 12px 16px; background: #fff; border-radius: 8px; border: 1px solid #e4e7ed; }
.perm-area-title { font-weight: 600; color: #14487e; margin-bottom: 12px; }
.perm-tree { max-height: 520px; overflow: auto; }

/* 按钮权限分组 */
.button-group { border: 1px solid #e4e7ed; border-radius: 6px; margin-bottom: 10px; padding: 10px 14px; }
.button-group-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.group-count { margin-left: auto; }
.button-checkboxes { display: flex; flex-wrap: wrap; gap: 6px 16px; }

.form-tip { font-size: 11px; color: #909399; margin-top: 2px; }
</style>
