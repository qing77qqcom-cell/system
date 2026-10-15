<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { UploadFilled } from '@element-plus/icons-vue'
import { createOrder, updateOrder, getOrder, assignOrder } from '@/api/order'
import { getMeta } from '@/api/meta'
import { uploadFile } from '@/api/upload'
import { listUsers } from '@/api/user'
import { currentUser, currentUserInfo, formatDate } from '@/utils/helpers'

const route = useRoute()
const router = useRouter()

const isEdit = computed(() => !!route.params.id)
const formRef = ref()
const submitting = ref(false)
const fileList = ref([])

// 下拉选项（来自后端 /api/meta）
const deptOptions = ref([])
const typeOptions = ref([])
const priorityOptions = ref([])
const permOptions = ref([])
const deviceOptions = ref([])

async function loadMeta() {
  const meta = await getMeta()
  deptOptions.value = meta.depts
  typeOptions.value = meta.types
  priorityOptions.value = meta.priorities
  permOptions.value = meta.permTypes
  deviceOptions.value = meta.deviceTypes
}

// 默认截止时间：明天 18:00
const defaultDeadline = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${formatDate(d)} 18:00`
}

const form = reactive({
  title: '',
  dept: '',
  type: '',
  priority: '中',
  submitter: currentUser(),
  deadline: defaultDeadline(),
  description: '',
  extra: {},
})

// 动态校验规则：随问题类型变化
const rules = computed(() => {
  const r = {
    title: [
      { required: true, message: '请输入工单标题', trigger: 'blur' },
      { max: 30, message: '标题不能超过 30 个字', trigger: 'blur' },
    ],
    dept: [{ required: true, message: '请选择所属部门', trigger: 'change' }],
    type: [{ required: true, message: '请选择问题类型', trigger: 'change' }],
    priority: [{ required: true, message: '请选择优先级', trigger: 'change' }],
    description: [
      { required: true, message: '请填写问题描述', trigger: 'blur' },
      { min: 5, message: '问题描述不少于 5 个字', trigger: 'blur' },
    ],
  }
  // 注意：嵌套 model 字段的规则 key 必须与 prop 的完整路径一致（扁平写法）
  if (form.type === '账号权限') {
    r['extra.account'] = [
      { required: true, message: '请输入账号', trigger: 'blur' },
      { pattern: /^[a-zA-Z0-9_.@-]+$/, message: '账号只能包含字母、数字及 _ . @ -', trigger: 'blur' },
    ]
    r['extra.permType'] = [{ required: true, message: '请选择权限类型', trigger: 'change' }]
  }
  if (form.type === '设备故障') {
    r['extra.deviceNo'] = [{ required: true, message: '请输入设备编号', trigger: 'blur' }]
    r['extra.deviceType'] = [{ required: true, message: '请选择设备类型', trigger: 'change' }]
  }
  return r
})

// 切换问题类型时清空动态字段，避免脏数据提交
const handleTypeChange = () => {
  form.extra = {}
  formRef.value?.clearValidate()
}

// ============ 附件上传（真实上传到后端 /api/upload，返回 { name, url }） ============
const handleUpload = async (option) => {
  const item = reactive({
    uid: option.file.uid ?? Date.now() + Math.random(),
    name: option.file.name,
    status: 'uploading',
    percentage: 0,
    url: '',
  })
  fileList.value.push(item)
  try {
    const res = await uploadFile(option.file, (p) => {
      item.percentage = p
      option.onProgress({ percent: p })
    })
    item.url = res.url
    item.status = 'success'
    item.percentage = 100
    option.onSuccess(res)
  } catch (err) {
    item.status = 'fail'
    option.onError(err)
  }
}
const handleRemove = (file) => {
  fileList.value = fileList.value.filter((f) => f.uid !== file.uid)
}
const handleExceed = () => ElMessage.warning('最多只能上传 5 个附件')

// ============ 未保存提醒 ============
const buildPayload = () => ({
  title: form.title,
  dept: form.dept,
  type: form.type,
  priority: form.priority,
  deadline: form.deadline,
  description: form.description,
  attachments: fileList.value
    .filter((f) => f.status === 'success')
    .map((f) => ({ name: f.name, url: f.url })),
  extra: { ...form.extra },
})

let snapshot = ''
const dirty = computed(() => JSON.stringify(buildPayload()) !== snapshot)
const markClean = () => {
  snapshot = JSON.stringify(buildPayload())
}

// 路由离开拦截（含浏览器内菜单跳转）
onBeforeRouteLeave(() => {
  if (!dirty.value || submitting.value) return true
  return ElMessageBox.confirm('表单存在未保存的修改，确定要离开吗？', '未保存提醒', {
    confirmButtonText: '离开',
    cancelButtonText: '继续编辑',
    type: 'warning',
  })
    .then(() => true)
    .catch(() => false)
})

// ============ 提交 / 取消 ============
const handleSubmit = async () => {
  if (submitting.value) return
  if (fileList.value.some((f) => f.status === 'uploading')) {
    ElMessage.warning('附件正在上传中，请稍候')
    return
  }
  try {
    await formRef.value.validate()
  } catch {
    ElMessage.error('请完善必填信息后再提交')
    return
  }
  submitting.value = true
  try {
    const payload = buildPayload()
    if (isEdit.value) {
      await updateOrder(route.params.id, payload)
      ElMessage.success('工单修改成功')
      markClean()
      router.replace(`/work-orders/${route.params.id}`)
    } else {
      const order = await createOrder(payload)
      ElMessage.success('工单提交成功')
      markClean()
      router.replace(`/work-orders/${order.id}`)
    }
  } catch {
    // 错误提示由响应拦截器统一弹出
  } finally {
    submitting.value = false
  }
}

const handleCancel = () => {
  if (!dirty.value) {
    router.back()
    return
  }
  ElMessageBox.confirm('表单存在未保存的修改，确定要取消吗？', '取消确认', {
    confirmButtonText: '放弃修改',
    cancelButtonText: '继续编辑',
    type: 'warning',
  })
    .then(() => router.back())
    .catch(() => {})
}

// ============ 分配处理人（仅编辑模式 + 部长/超管可见；后端仍做权限兜底） ============
const canAssign = computed(() => {
  const role = currentUserInfo()?.role
  return isEdit.value && ['部长', '超级管理员'].includes(role)
})

const assignDialogVisible = ref(false)
const assignLoading = ref(false)
const assigning = ref(false)
const handlerOptions = ref([])
const selectedHandlerId = ref(null)

const openAssignDialog = async () => {
  assignDialogVisible.value = true
  assignLoading.value = true
  try {
    // 只能分配给启用中的用户
    handlerOptions.value = await listUsers({ status: '启用' })
  } finally {
    assignLoading.value = false
  }
}

const handleAssignSubmit = async () => {
  if (!selectedHandlerId.value) {
    ElMessage.warning('请选择处理人')
    return
  }
  assigning.value = true
  try {
    await assignOrder(route.params.id, selectedHandlerId.value)
    ElMessage.success('分配成功')
    assignDialogVisible.value = false
  } catch {
    // 错误提示由响应拦截器统一弹出
  } finally {
    assigning.value = false
  }
}

onMounted(async () => {
  loadMeta()
  if (!isEdit.value) {
    markClean()
    return
  }
  try {
    const order = await getOrder(route.params.id)
    Object.assign(form, {
      title: order.title,
      dept: order.dept,
      type: order.type,
      priority: order.priority,
      submitter: order.submitter,
      deadline: order.deadline,
      description: order.description,
      extra: { ...order.extra },
    })
    fileList.value = (order.attachments || []).map((f, i) => ({
      uid: Date.now() + i,
      name: f.name,
      url: f.url,
      status: 'success',
      percentage: 100,
    }))
    markClean()
  } catch {
    ElMessage.error('工单不存在或已被删除')
    router.replace('/work-orders')
  }
})
</script>

<template>
  <div class="order-form">
    <el-card shadow="never" class="form-card">
      <template #header>
        <span class="block-title">{{ isEdit ? '编辑工单' : '新建工单' }}</span>
      </template>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="92px"
        class="form-body"
        :validate-on-rule-change="false"
      >
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="标题" prop="title">
              <el-input v-model="form.title" placeholder="请简要描述问题" maxlength="30" show-word-limit clearable />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="提交人">
              <div class="submitter-row">
                <el-input v-model="form.submitter" placeholder="提交人" readonly />
                <el-button v-if="canAssign" type="primary" plain @click="openAssignDialog">
                  分配处理人
                </el-button>
              </div>
            </el-form-item>
          </el-col>

          <el-col :span="12">
            <el-form-item label="所属部门" prop="dept">
              <el-select v-model="form.dept" placeholder="请选择部门" style="width: 100%">
                <el-option v-for="d in deptOptions" :key="d" :label="d" :value="d" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="问题类型" prop="type">
              <el-select v-model="form.type" placeholder="请选择问题类型" style="width: 100%" @change="handleTypeChange">
                <el-option v-for="t in typeOptions" :key="t" :label="t" :value="t" />
              </el-select>
            </el-form-item>
          </el-col>

          <el-col :span="12">
            <el-form-item label="优先级" prop="priority">
              <el-radio-group v-model="form.priority">
                <el-radio-button v-for="p in priorityOptions" :key="p" :value="p" :label="p">
                  {{ p }}
                </el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="截止时间">
              <el-date-picker
                v-model="form.deadline"
                type="datetime"
                placeholder="请选择截止时间"
                format="YYYY-MM-DD HH:mm"
                value-format="YYYY-MM-DD HH:mm"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>

          <el-col :span="24">
            <el-form-item label="问题描述" prop="description">
              <el-input
                v-model="form.description"
                type="textarea"
                :rows="4"
                maxlength="200"
                show-word-limit
                placeholder="请详细描述问题现象、出现时间、已尝试的解决办法等（不少于 5 个字）"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 动态字段：账号权限 -->
        <template v-if="form.type === '账号权限'">
          <el-divider content-position="left">账号权限信息</el-divider>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="账号" prop="extra.account">
                <el-input v-model="form.extra.account" placeholder="请输入 OA 账号" clearable />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="权限类型" prop="extra.permType">
                <el-select v-model="form.extra.permType" placeholder="请选择权限类型" style="width: 100%">
                  <el-option v-for="p in permOptions" :key="p" :label="p" :value="p" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="24">
              <el-form-item label="申请原因">
                <el-input
                  v-model="form.extra.applyReason"
                  type="textarea"
                  :rows="2"
                  maxlength="100"
                  show-word-limit
                  placeholder="请说明申请该权限的原因"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <!-- 动态字段：设备故障 -->
        <template v-else-if="form.type === '设备故障'">
          <el-divider content-position="left">设备故障信息</el-divider>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="设备编号" prop="extra.deviceNo">
                <el-input v-model="form.extra.deviceNo" placeholder="例如：PC-JS-022" clearable />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="设备类型" prop="extra.deviceType">
                <el-select v-model="form.extra.deviceType" placeholder="请选择设备类型" style="width: 100%">
                  <el-option v-for="d in deviceOptions" :key="d" :label="d" :value="d" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="24">
              <el-form-item label="故障描述">
                <el-input
                  v-model="form.extra.faultDesc"
                  type="textarea"
                  :rows="2"
                  maxlength="100"
                  show-word-limit
                  placeholder="请描述设备故障的具体表现"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <!-- 附件 -->
        <el-form-item label="附件">
          <el-upload
            :file-list="fileList"
            :http-request="handleUpload"
            :on-remove="handleRemove"
            :on-exceed="handleExceed"
            :limit="5"
            multiple
            action="#"
          >
            <el-button type="primary" plain :icon="UploadFilled">上传附件</el-button>
            <template #tip>
              <div class="upload-tip">支持图片、文档等格式，单个工单最多 5 个附件</div>
            </template>
          </el-upload>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">
            {{ isEdit ? '保存修改' : '提交工单' }}
          </el-button>
          <el-button @click="handleCancel">取消</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 分配处理人弹窗 -->
    <el-dialog v-model="assignDialogVisible" title="分配处理人" width="420px">
      <el-select
        v-model="selectedHandlerId"
        v-loading="assignLoading"
        placeholder="请选择处理人"
        filterable
        style="width: 100%"
      >
        <el-option
          v-for="u in handlerOptions"
          :key="u.id"
          :label="`${u.name}（${u.dept} · ${u.role}）`"
          :value="u.id"
        />
      </el-select>
      <template #footer>
        <el-button @click="assignDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="assigning" @click="handleAssignSubmit">确定分配</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.form-card {
  border-radius: 10px;
  border: none;
  box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
}
.block-title {
  font-size: 16px;
  font-weight: 600;
  color: #14487e;
}
.form-body {
  max-width: 900px;
}
.upload-tip {
  margin-top: 6px;
  font-size: 12px;
  color: #94a8bd;
}
.submitter-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.submitter-row .el-input {
  flex: 1;
}
.submitter-row .el-button {
  flex-shrink: 0;
}
</style>
