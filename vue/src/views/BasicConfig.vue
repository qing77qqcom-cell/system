<script setup>
defineOptions({ name: 'BasicConfig' })
/**
 * 基础数据配置（admin）
 * 四个 tab：数据字典 / 表单字段 / 通知模板 / 系统参数
 * 全部对接 server/src/routes/config.js 的真实 API
 */
import { ref, reactive, onMounted, onActivated, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import request from '@/utils/request.js'

const route = useRoute()
const router = useRouter()

// 当前 tab（从 URL query ?tab= 读，默认 dict）
const activeTab = ref(route.query.tab || 'dict')

// URL 同步：切 tab → router 带 query；刷新 → 从 query 恢复
function onTabChange(tab) {
  activeTab.value = tab
  router.replace({ query: { tab } })
}

// ============== 数据字典 ==============
const DICT_TYPES = [
  { value: 'priority',         label: '优先级' },
  { value: 'ticket_status',    label: '工单状态' },
  { value: 'ticket_type',      label: '工单类型' },
  { value: 'fault_category',   label: '故障分类' },
  { value: 'approver_strategy', label: '审批策略' },
  { value: 'sla_metric_type',  label: 'SLA 指标类型' },
]
const dictType = ref('priority')
const dictList = ref([])
const dictLoading = ref(false)
async function loadDicts() {
  dictLoading.value = true
  try {
    dictList.value = await request.get('/dictionaries', { params: { dict_type: dictType.value } })
  } catch { dictList.value = [] }
  finally { dictLoading.value = false }
}
const dictDialog = reactive({ visible: false, mode: 'add', form: null })
function openDictAdd() {
  dictDialog.mode = 'add'
  dictDialog.form = { dictType: dictType.value, code: '', label: '', sort: 0, active: true }
  dictDialog.visible = true
}
function openDictEdit(row) {
  dictDialog.mode = 'edit'
  dictDialog.form = { ...row }
  dictDialog.visible = true
}
async function submitDict() {
  const f = dictDialog.form
  try {
    if (dictDialog.mode === 'add') {
      await request.post('/dictionaries', f)
      ElMessage.success('新增成功')
    } else {
      await request.put(`/dictionaries/${f.id}`, f)
      ElMessage.success('修改成功')
    }
    dictDialog.visible = false
    await loadDicts()
  } catch { /* 拦截器已提示 */ }
}
async function toggleDictActive(row) {
  const next = !row.active
  await request.put(`/dictionaries/${row.id}`, { label: row.label, sort: row.sort, active: next })
  row.active = next
  ElMessage.success(next ? '已启用' : '已停用')
}

// ============== 表单字段配置 ==============
const FIELD_TYPES = [
  { value: 'text', label: '文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'number', label: '数字' },
  { value: 'select', label: '下拉选择' },
  { value: 'date', label: '日期' },
]
const FORM_TICKET_TYPES = ['fault_repair', 'account_permission', 'reimbursement']
const formTicketType = ref('fault_repair')
const formList = ref([])
const formLoading = ref(false)
async function loadForms() {
  formLoading.value = true
  try {
    formList.value = await request.get('/form-configs', { params: { ticket_type: formTicketType.value } })
  } catch { formList.value = [] }
  finally { formLoading.value = false }
}
const formDialog = reactive({ visible: false, mode: 'add', form: null })
function openFormAdd() {
  formDialog.mode = 'add'
  formDialog.form = {
    ticketType: formTicketType.value, fieldKey: '', label: '', fieldType: 'text',
    required: false, options: [], sort: 0, active: true,
  }
  formDialog.visible = true
}
function openFormEdit(row) {
  formDialog.mode = 'edit'
  formDialog.form = { ...row, options: Array.isArray(row.options) ? row.options : [] }
  formDialog.visible = true
}
async function submitFormField() {
  const f = formDialog.form
  if (f.fieldType === 'select' && (!Array.isArray(f.options) || !f.options.length)) {
    return ElMessage.error('下拉选择类型必须提供选项')
  }
  try {
    if (formDialog.mode === 'add') {
      await request.post('/form-configs', f)
      ElMessage.success('新增成功')
    } else {
      await request.put(`/form-configs/${f.id}`, f)
      ElMessage.success('修改成功')
    }
    formDialog.visible = false
    await loadForms()
  } catch { /* 拦截器已提示 */ }
}
async function toggleFormActive(row) {
  const next = !row.active
  await request.put(`/form-configs/${row.id}`, { ...row, active: next })
  row.active = next
  ElMessage.success(next ? '已启用' : '已停用')
}
// options 编辑辅助
function addOption() { formDialog.form?.options?.push('') }
function removeOption(i) { formDialog.form?.options?.splice(i, 1) }

// ============== 通知模板 ==============
const tplList = ref([])
const tplLoading = ref(false)
async function loadTpls() {
  tplLoading.value = true
  try {
    tplList.value = await request.get('/notification-templates')
  } catch { tplList.value = [] }
  finally { tplLoading.value = false }
}
const tplDialog = reactive({ visible: false, form: null })
function openTplEdit(row) {
  tplDialog.form = { ...row }
  tplDialog.visible = true
}
async function submitTpl() {
  try {
    await request.put(`/notification-templates/${tplDialog.form.id}`, tplDialog.form)
    ElMessage.success('保存成功')
    tplDialog.visible = false
    await loadTpls()
  } catch { /* 拦截器已提示 */ }
}

// ============== 系统参数 ==============
const paramList = ref([])
const paramLoading = ref(false)
async function loadParams() {
  paramLoading.value = true
  try {
    paramList.value = await request.get('/system-params')
  } catch { paramList.value = [] }
  finally { paramLoading.value = false }
}
async function editParam(row) {
  try {
    const { value } = await ElMessageBox.prompt(
      `参数描述：${row.description}\n当前值：${typeof row.value === 'string' ? row.value : JSON.stringify(row.value)}`,
      `编辑参数：${row.key}`,
      { inputValue: typeof row.value === 'string' ? row.value : JSON.stringify(row.value), inputPlaceholder: '输入新值' },
    )
    await request.put(`/system-params/${row.key}`, { value })
    row.value = value
    ElMessage.success('已更新')
  } catch { /* 用户取消或拦截器提示 */ }
}

// ============== 生命周期 ==============
const tabLoaders = { dict: loadDicts, form: loadForms, template: loadTpls, params: loadParams }
async function reloadAll() { await (tabLoaders[activeTab.value] || (() => {}))() }
onMounted(reloadAll)
onActivated(reloadAll)

// watch dictType / formTicketType 变化自动 reload
import { watch } from 'vue'
watch(dictType, loadDicts)
watch(formTicketType, loadForms)
</script>

<template>
  <div class="basic-config">
    <el-tabs v-model="activeTab" @tab-change="onTabChange">

      <!-- ============ Tab 1: 数据字典 ============ -->
      <el-tab-pane label="📖 数据字典" name="dict">
        <el-card shadow="never">
          <div class="tab-toolbar">
            <span class="label">字典类型：</span>
            <el-select v-model="dictType" style="width:180px">
              <el-option v-for="d in DICT_TYPES" :key="d.value" :label="d.label" :value="d.value" />
            </el-select>
            <el-button type="primary" :icon="Plus" @click="openDictAdd">新增字典项</el-button>
            <el-button :icon="Refresh" @click="loadDicts">刷新</el-button>
          </div>
          <el-table :data="dictList" v-loading="dictLoading" border stripe style="margin-top:10px">
            <el-table-column prop="code" label="Code" width="180" />
            <el-table-column prop="label" label="显示名" />
            <el-table-column prop="sort" label="排序" width="80" align="center" />
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-switch v-model="row.active" @change="toggleDictActive(row)" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="center">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="openDictEdit(row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- ============ Tab 2: 表单字段 ============ -->
      <el-tab-pane label="📋 表单字段" name="form">
        <el-card shadow="never">
          <div class="tab-toolbar">
            <span class="label">工单类型：</span>
            <el-select v-model="formTicketType" style="width:200px">
              <el-option v-for="t in FORM_TICKET_TYPES" :key="t" :label="t" :value="t" />
            </el-select>
            <el-button type="primary" :icon="Plus" @click="openFormAdd">新增字段</el-button>
            <el-button :icon="Refresh" @click="loadForms">刷新</el-button>
          </div>
          <el-table :data="formList" v-loading="formLoading" border stripe style="margin-top:10px">
            <el-table-column prop="fieldKey" label="字段 Key" width="180" />
            <el-table-column prop="label" label="显示名" width="140" />
            <el-table-column label="类型" width="100">
              <template #default="{ row }">
                <el-tag size="small">{{ FIELD_TYPES.find(t => t.value === row.fieldType)?.label || row.fieldType }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="必填" width="80" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.required" size="small" type="danger">是</el-tag>
                <el-tag v-else size="small" type="info">否</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="sort" label="排序" width="80" align="center" />
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-switch v-model="row.active" @change="toggleFormActive(row)" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="center">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="openFormEdit(row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- ============ Tab 3: 通知模板 ============ -->
      <el-tab-pane label="📨 通知模板" name="template">
        <el-card shadow="never">
          <div class="tab-toolbar">
            <span class="label">管理员维护站内通知模板（暂不可新增/删除，只可编辑）</span>
            <el-button :icon="Refresh" @click="loadTpls">刷新</el-button>
          </div>
          <el-table :data="tplList" v-loading="tplLoading" border stripe style="margin-top:10px">
            <el-table-column prop="code" label="模板编码" width="160" />
            <el-table-column prop="title" label="标题" width="180" />
            <el-table-column prop="content" label="内容预览" show-overflow-tooltip />
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.active ? 'success' : 'info'" size="small">{{ row.active ? '启用' : '停用' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="center">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="openTplEdit(row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- ============ Tab 4: 系统参数 ============ -->
      <el-tab-pane label="⚙️ 系统参数" name="params">
        <el-card shadow="never">
          <div class="tab-toolbar">
            <span class="label">系统级 key-value 参数，修改立即生效</span>
            <el-button :icon="Refresh" @click="loadParams">刷新</el-button>
          </div>
          <el-table :data="paramList" v-loading="paramLoading" border stripe style="margin-top:10px">
            <el-table-column prop="key" label="Key" width="180" />
            <el-table-column prop="description" label="说明" width="200" />
            <el-table-column label="值">
              <template #default="{ row }">
                <code>{{ typeof row.value === 'string' ? row.value : JSON.stringify(row.value) }}</code>
              </template>
            </el-table-column>
            <el-table-column prop="updatedAt" label="更新时间" width="180" />
            <el-table-column label="操作" width="100" align="center">
              <template #default="{ row }">
                <el-button text type="primary" size="small" @click="editParam(row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- ============ 字典/表单字段 编辑弹窗 ============ -->
    <el-dialog v-model="dictDialog.visible" :title="dictDialog.mode === 'add' ? '新增字典项' : '编辑字典项'" width="460px" destroy-on-close>
      <el-form v-if="dictDialog.form" :model="dictDialog.form" label-width="80px">
        <el-form-item label="字典类型">
          <el-select v-model="dictDialog.form.dictType" style="width:100%">
            <el-option v-for="d in DICT_TYPES" :key="d.value" :label="d.label" :value="d.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="Code">
          <el-input v-model="dictDialog.form.code" :disabled="dictDialog.mode === 'edit'" placeholder="小写字母/数字/下划线" />
        </el-form-item>
        <el-form-item label="显示名">
          <el-input v-model="dictDialog.form.label" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="dictDialog.form.sort" :min="0" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="dictDialog.form.active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dictDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitDict">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="formDialog.visible" :title="formDialog.mode === 'add' ? '新增表单字段' : '编辑表单字段'" width="520px" destroy-on-close>
      <el-form v-if="formDialog.form" :model="formDialog.form" label-width="100px">
        <el-form-item label="工单类型">
          <el-select v-model="formDialog.form.ticketType" style="width:100%" :disabled="formDialog.mode === 'edit'">
            <el-option v-for="t in FORM_TICKET_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="字段 Key">
          <el-input v-model="formDialog.form.fieldKey" :disabled="formDialog.mode === 'edit'" placeholder="字母开头，仅限字母/数字/下划线" />
        </el-form-item>
        <el-form-item label="显示名">
          <el-input v-model="formDialog.form.label" />
        </el-form-item>
        <el-form-item label="字段类型">
          <el-select v-model="formDialog.form.fieldType" style="width:100%">
            <el-option v-for="t in FIELD_TYPES" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="formDialog.form.fieldType === 'select'" label="选项">
          <div class="options-list">
            <div v-for="(opt, i) in formDialog.form.options" :key="i" class="option-row">
              <el-input v-model="formDialog.form.options[i]" placeholder="选项值" />
              <el-button text type="danger" @click="removeOption(i)">删</el-button>
            </div>
            <el-button text type="primary" @click="addOption">+ 加选项</el-button>
          </div>
        </el-form-item>
        <el-form-item label="必填">
          <el-switch v-model="formDialog.form.required" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="formDialog.form.sort" :min="0" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="formDialog.form.active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitFormField">保存</el-button>
      </template>
    </el-dialog>

    <!-- ============ 通知模板 编辑弹窗 ============ -->
    <el-dialog v-model="tplDialog.visible" title="编辑通知模板" width="560px" destroy-on-close>
      <el-form v-if="tplDialog.form" :model="tplDialog.form" label-width="80px">
        <el-form-item label="编码">
          <el-input v-model="tplDialog.form.code" disabled />
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="tplDialog.form.title" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="tplDialog.form.content" type="textarea" :rows="4" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="tplDialog.form.active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tplDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitTpl">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.basic-config { min-height: 600px; }
.tab-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tab-toolbar .label { font-size: 13px; color: #606266; }
.options-list { display: flex; flex-direction: column; gap: 6px; }
.option-row { display: flex; gap: 8px; align-items: center; }
.option-row .el-input { flex: 1; }
</style>
