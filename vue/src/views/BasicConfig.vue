<script setup>
defineOptions({ name: 'BasicConfig' })
/**
 * 基础数据配置（admin）
 * 四个 tab：数据字典 / 表单字段 / 通知模板 / 系统参数
 * 原生 Radio Hack Tab：纯 CSS 切换，无 JS 控制显示隐藏
 * 仅用一点点 JS 做 URL query 双向同步（二级菜单跳转带 ?tab=xxx）
 */
import { ref, reactive, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import request from '@/utils/request.js'

const route = useRoute()
const router = useRouter()

// ============ Tab 状态（v-model 绑定 4 个 radio，name 相同 = 浏览器原生互斥） ============
const TAB_KEYS = ['dict', 'form', 'template', 'params']
const tabValue = ref(TAB_KEYS.includes(route.query.tab) ? route.query.tab : 'dict')

// URL → radio：二级菜单跳转带 ?tab=xxx 时，自动切到对应 tab
watch(() => route.query.tab, (q) => {
  if (TAB_KEYS.includes(q) && q !== tabValue.value) tabValue.value = q
})
// radio → URL：手动点击 tab 时，同步 query（这样刷新后能恢复）
watch(tabValue, (v) => {
  if (route.query.tab !== v) router.replace({ query: { ...route.query, tab: v } })
})

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

// ============== 生命周期：全量预加载 4 个 tab 的数据 ==============
onMounted(async () => {
  await Promise.allSettled([loadDicts(), loadForms(), loadTpls(), loadParams()])
})

// watch dictType / formTicketType 变化自动 reload（只 reload 对应 tab 的数据）
watch(dictType, loadDicts)
watch(formTicketType, loadForms)
</script>

<template>
  <div class="basic-config">
    <!-- ============ 原生 Tab 栏（Radio Hack：无 JS 控制切换） ============ -->
    <!--
      原理：
      1. 4 个隐藏 radio，name 相同 → 浏览器原生单选互斥
      2. Vue v-model 绑定 tabValue → 初始化时从 URL ?tab=xxx 恢复
      3. <label for="xxx"> 点击 = 选中对应 radio（纯 HTML for 属性，不需要 JS 事件）
      4. CSS 用相邻兄弟选择器 #tab-dict:checked ~ .tab-bar .tab-indicator → 控制下划线 transform
      5. #tab-dict:checked ~ .tab-panels .tab-panel--dict → 控制哪个面板显示
      6. tab 自身显示隐藏完全由 CSS 控制；JS 仅做 URL 双向同步
    -->
    <div class="basic-tabs">
      <!-- 4 个隐藏 radio：v-model 绑定 = 初始化值 + 互斥行为 + Vue 响应式 -->
      <input type="radio" name="basic-tab" id="tab-dict" class="tab-radio" value="dict" v-model="tabValue" />
      <input type="radio" name="basic-tab" id="tab-form" class="tab-radio" value="form" v-model="tabValue" />
      <input type="radio" name="basic-tab" id="tab-template" class="tab-radio" value="template" v-model="tabValue" />
      <input type="radio" name="basic-tab" id="tab-params" class="tab-radio" value="params" v-model="tabValue" />

      <!-- Tab 栏：flex 横排，相对定位装下划线指示器 -->
      <div class="tab-bar" role="tablist">
        <label for="tab-dict" class="tab-label" role="tab" tabindex="0">📖 数据字典</label>
        <label for="tab-form" class="tab-label" role="tab" tabindex="0">📋 表单字段</label>
        <label for="tab-template" class="tab-label" role="tab" tabindex="0">📨 通知模板</label>
        <label for="tab-params" class="tab-label" role="tab" tabindex="0">⚙️ 系统参数</label>
        <!-- 下划线指示器：绝对定位，宽度跟随选中 label，transform 滑动 -->
        <span class="tab-indicator" aria-hidden="true"></span>
      </div>

      <!-- 4 个面板：默认 display:none，由 :checked ~ .tab-panels .tab-panel--xxx 控制显示 -->
      <div class="tab-panels">

        <!-- ============ Panel 1: 数据字典 ============ -->
        <div class="tab-panel tab-panel--dict" role="tabpanel">
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
        </div>

        <!-- ============ Panel 2: 表单字段 ============ -->
        <div class="tab-panel tab-panel--form" role="tabpanel">
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
        </div>

        <!-- ============ Panel 3: 通知模板 ============ -->
        <div class="tab-panel tab-panel--template" role="tabpanel">
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
        </div>

        <!-- ============ Panel 4: 系统参数 ============ -->
        <div class="tab-panel tab-panel--params" role="tabpanel">
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
        </div>

      </div><!-- /.tab-panels -->
    </div><!-- /.basic-tabs -->

    <!-- ============ 字典 / 表单字段 / 通知模板 编辑弹窗 ============ -->
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
            <div v-for="(_, i) in formDialog.form.options" :key="i" class="option-row">
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
/* ============ 页面基本样式 ============ */
.basic-config { min-height: 600px; }
.tab-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tab-toolbar .label { font-size: 13px; color: #606266; }
.options-list { display: flex; flex-direction: column; gap: 6px; }
.option-row { display: flex; gap: 8px; align-items: center; }
.option-row .el-input { flex: 1; }

/* ============ Radio Hack 核心样式 ============ */
/* 隐藏 radio，但保留可聚焦（屏幕阅读器和键盘可达性） */
.tab-radio {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

/* Tab 容器 */
.basic-tabs {
  position: relative;
  margin-bottom: 16px;
}

/* Tab 栏：flex 横排，相对定位装下划线 */
.tab-bar {
  position: relative;
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid #e4e7ed;
  background: #fff;
  /* 移动端横滑基础 */
  overflow-x: hidden;
}

/* Tab label */
.tab-label {
  flex: 0 0 auto;
  padding: 12px 22px;
  font-size: 14px;
  color: #606266;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  /* 键盘聚焦可见环 */
  outline: none;
  transition: color 200ms ease;
  /* 让 4 个 label 等宽（电脑端） */
  flex: 1 1 0;
  text-align: center;
}
.tab-label:hover { color: #409eff; }
.tab-label:focus-visible {
  color: #409eff;
  box-shadow: inset 0 -2px 0 0 #409eff;
}

/* 下划线指示器 */
.tab-indicator {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  background: #409eff;
  border-radius: 1px;
  /* 初始位置和宽度：第一个 tab */
  width: 25%;
  transform: translateX(0);
  transition:
    transform 200ms cubic-bezier(0.4, 0, 0.2, 1),
    width     200ms cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1;
}

/* ============ 4 组 :checked 控制 ============ */
/* 下划线滑动 + 对应 label 高亮文字颜色 */
#tab-dict:checked ~ .tab-bar .tab-indicator { transform: translateX(0); }
#tab-form:checked ~ .tab-bar .tab-indicator { transform: translateX(100%); }
#tab-template:checked ~ .tab-bar .tab-indicator { transform: translateX(200%); }
#tab-params:checked ~ .tab-bar .tab-indicator { transform: translateX(300%); }

#tab-dict:checked ~ .tab-bar .tab-label[for="tab-dict"],
#tab-form:checked ~ .tab-bar .tab-label[for="tab-form"],
#tab-template:checked ~ .tab-bar .tab-label[for="tab-template"],
#tab-params:checked ~ .tab-bar .tab-label[for="tab-params"] {
  color: #409eff;
  font-weight: 600;
}

/* ============ 面板显示切换 ============ */
.tab-panels { position: relative; margin-top: 16px; }
.tab-panel {
  /* 默认隐藏 */
  display: none;
  opacity: 0;
  animation: tabPanelFade 260ms ease both;
}
@keyframes tabPanelFade {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* 只有 checked 的那个 panel 显示 */
#tab-dict:checked  ~ .tab-panels > .tab-panel--dict    { display: block; }
#tab-form:checked  ~ .tab-panels > .tab-panel--form   { display: block; }
#tab-template:checked ~ .tab-panels > .tab-panel--template { display: block; }
#tab-params:checked ~ .tab-panels > .tab-panel--params { display: block; }

/* ============ 移动端：横滑 + scroll-snap + 渐隐遮罩 ============ */
@media (max-width: 768px) {
  .tab-bar {
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    /* 两端渐隐遮罩（用伪元素 + mask 实现） */
    mask-image: linear-gradient(
      to right,
      transparent 0,
      black 24px,
      black calc(100% - 24px),
      transparent 100%
    );
    -webkit-mask-image: linear-gradient(
      to right,
      transparent 0,
      black 24px,
      black calc(100% - 24px),
      transparent 100%
    );
  }
  /* 隐藏滚动条但保留滚动能力 */
  .tab-bar::-webkit-scrollbar { height: 0; display: none; }

  .tab-label {
    flex: 0 0 auto;         /* 不拉伸，保留自然宽度 */
    scroll-snap-align: start;
    padding: 12px 18px;
    font-size: 13px;
  }

  /* 下划线指示器：移动端 label 不等宽，改用第一个 label 宽度的占位不行 → 用百分比 */
  /* 移动端保持 25% 宽度（4 个 tab），但 transform 也要按比例 */
  .tab-indicator { width: 25%; }
}

/* ============ 尊重用户动画偏好 ============ */
@media (prefers-reduced-motion: reduce) {
  .tab-indicator { transition: none !important; }
  .tab-panel { animation: none !important; transition: none !important; opacity: 1 !important; }
  .tab-label { transition: none !important; }
}
</style>
