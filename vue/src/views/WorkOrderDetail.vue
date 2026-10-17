<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Back,
  Edit,
  Bell,
  RefreshLeft,
  Select,
  CircleClose,
  Paperclip,
} from '@element-plus/icons-vue'
import { getOrder, updateOrderStatus, urgeOrder, assignOrder } from '@/api/order'
import { listUsers } from '@/api/user'
import { PRIORITY_TAG_TYPE, STATUS_TAG_TYPE } from '@/constants'
import { isOverdue, currentUserInfo } from '@/utils/helpers'

const route = useRoute()
const router = useRouter()

const acting = ref(false)
const loading = ref(false)
const notFound = ref(false)

// 工单详情（含处理日志 logs），不存在/无权查看 → notFound
const order = ref(null)

async function loadOrder() {
  loading.value = true
  notFound.value = false
  try {
    order.value = await getOrder(route.params.id)
  } catch {
    order.value = null
    notFound.value = true
  } finally {
    loading.value = false
  }
}

// 动态字段中文映射
const EXTRA_LABELS = {
  account: '账号',
  permType: '权限类型',
  applyReason: '申请原因',
  deviceNo: '设备编号',
  deviceType: '设备类型',
  faultDesc: '故障描述',
}
const extraEntries = computed(() =>
  order.value ? Object.entries(order.value.extra || {}).filter(([, v]) => v) : [],
)

// 进度步骤
const steps = ['提交工单', '已接单', '处理中', '已完成']
const stepActive = computed(() => {
  if (!order.value) return 0
  return { 待处理: 1, 处理中: 2, 已完成: 3, 已关闭: 3, 已退回: 1 }[order.value.status] ?? 0
})
const stepStatus = computed(() => {
  if (order.value?.status === '已退回') return 'error'
  if (order.value?.status === '已完成') return 'success'
  return 'process'
})

const active = computed(() => ['待处理', '处理中'].includes(order.value?.status))

// ============ 分配处理人（部长/超管可见，后端仍做权限与状态兜底） ============
const canAssign = computed(() => {
  const role = currentUserInfo()?.role
  return (
    ['部长', '超级管理员'].includes(role) &&
    ['待处理', '已退回'].includes(order.value?.status)
  )
})

const assignDialogVisible = ref(false)
const assignLoading = ref(false)
const assigning = ref(false)
const handlerOptions = ref([])
const selectedHandlerId = ref(null)

const openAssignDialog = async () => {
  assignDialogVisible.value = true
  selectedHandlerId.value = order.value?.handlerId || null
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
    await assignOrder(order.value.id, selectedHandlerId.value)
    ElMessage.success('分配成功')
    assignDialogVisible.value = false
    loadOrder()
  } catch {
    // 错误提示由响应拦截器统一弹出
  } finally {
    assigning.value = false
  }
}

const handleUrge = async () => {
  if (acting.value) return
  acting.value = true
  try {
    await urgeOrder(order.value.id)
    ElMessage.success('已催办，处理人将收到提醒')
    loadOrder()
  } catch {
    // 错误提示由响应拦截器统一弹出
  } finally {
    acting.value = false
  }
}

const handleReject = () => {
  ElMessageBox.prompt('请填写退回原因（将通知提交人）', '退回工单', {
    confirmButtonText: '确定退回',
    cancelButtonText: '取消',
    inputType: 'textarea',
    inputPlaceholder: '例如：信息不全，请补充后重新提交',
    inputValidator: (v) => (v && v.trim() ? true : '退回原因不能为空'),
  })
    .then(async ({ value }) => {
      await updateOrderStatus(order.value.id, 'reject', value.trim())
      ElMessage.success('工单已退回')
      loadOrder()
    })
    .catch(() => {})
}

const handleComplete = () => {
  ElMessageBox.confirm('确认该工单问题已处理完成吗？', '完成工单', {
    confirmButtonText: '确认完成',
    cancelButtonText: '取消',
    type: 'success',
  })
    .then(async () => {
      await updateOrderStatus(order.value.id, 'complete')
      ElMessage.success('工单已完成')
      loadOrder()
    })
    .catch(() => {})
}

const handleClose = () => {
  ElMessageBox.confirm('确认关闭该工单吗？关闭后将不再处理。', '关闭工单', {
    confirmButtonText: '确认关闭',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      await updateOrderStatus(order.value.id, 'close')
      ElMessage.success('工单已关闭')
      loadOrder()
    })
    .catch(() => {})
}

// 附件点击：新窗口打开真实文件（url 由后端 /api/upload 返回）
const openAttachment = (file) => {
  if (file.url) {
    window.open(`http://localhost:3000${file.url}`, '_blank')
  } else {
    ElMessage.info(`附件「${file.name}」无下载地址`)
  }
}

onMounted(loadOrder)
// 同一组件内切换工单 id（如从详情跳详情）时重新加载
watch(() => route.params.id, (id, old) => {
  if (id && id !== old) loadOrder()
})
</script>

<template>
  <div v-if="order" v-loading="loading" class="detail">
    <!-- 顶部信息条 -->
    <div class="top-bar">
      <div class="top-left">
        <el-button text :icon="Back" @click="router.back()">返回</el-button>
        <span class="order-title">{{ order.title }}</span>
        <el-tag size="small" type="info">{{ order.id }}</el-tag>
        <el-tag :type="STATUS_TAG_TYPE[order.status]" size="small">{{ order.status }}</el-tag>
        <el-tag v-if="isOverdue(order)" type="danger" size="small" effect="dark">已逾期</el-tag>
      </div>
      <div class="top-right">
        <el-button v-if="active" plain :icon="Edit" @click="router.push(`${route.path}/edit`)">
          编辑
        </el-button>
        <template v-if="active">
          <el-button type="warning" plain :icon="Bell" @click="handleUrge">催办</el-button>
          <el-button type="danger" plain :icon="RefreshLeft" @click="handleReject">退回</el-button>
          <el-button type="success" plain :icon="Select" @click="handleComplete">完成</el-button>
        </template>
        <el-button v-else-if="order.status === '已完成'" type="info" plain :icon="CircleClose" @click="handleClose">
          关闭工单
        </el-button>
      </div>
    </div>

    <!-- 工单进度 -->
    <el-card shadow="never" class="block">
      <template #header><span class="block-title">工单进度</span></template>
      <el-alert
        v-if="order.status === '已退回'"
        title="该工单已被退回，请根据处理记录中的原因修改后重新提交"
        type="error"
        :closable="false"
        show-icon
        style="margin-bottom: 18px"
      />
      <el-steps :active="stepActive" :status="stepStatus" align-center>
        <el-step v-for="s in steps" :key="s" :title="s" />
      </el-steps>
    </el-card>

    <!-- 基本信息 -->
    <el-card shadow="never" class="block">
      <template #header><span class="block-title">基本信息</span></template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="提交人">{{ order.submitter }}</el-descriptions-item>
        <el-descriptions-item label="所属部门">{{ order.dept }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ order.createdAt }}</el-descriptions-item>
        <el-descriptions-item label="处理人">
          <div class="handler-row">
            <span>{{ order.handler || '待分配' }}</span>
            <el-button v-if="canAssign" text type="primary" size="small" @click="openAssignDialog">
              分配处理人
            </el-button>
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="优先级">
          <el-tag :type="PRIORITY_TAG_TYPE[order.priority]" size="small">{{ order.priority }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="截止时间">
          <span :class="{ overdue: isOverdue(order) }">{{ order.deadline }}</span>
        </el-descriptions-item>
        <el-descriptions-item v-if="order.completedAt" label="完成时间">{{ order.completedAt }}</el-descriptions-item>
        <el-descriptions-item label="问题类型">{{ order.type }}</el-descriptions-item>
      </el-descriptions>

      <!-- 动态扩展信息 -->
      <el-descriptions
        v-if="extraEntries.length"
        :column="2"
        border
        style="margin-top: 16px"
        title="类型扩展信息"
      >
        <el-descriptions-item
          v-for="[key, value] in extraEntries"
          :key="key"
          :label="EXTRA_LABELS[key] || key"
        >
          {{ value }}
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 问题描述 -->
    <el-card shadow="never" class="block">
      <template #header><span class="block-title">问题描述</span></template>
      <p class="description-text">{{ order.description || '暂无描述' }}</p>
    </el-card>

    <!-- 处理记录 -->
    <el-card shadow="never" class="block">
      <template #header><span class="block-title">处理记录</span></template>
      <el-timeline>
        <el-timeline-item
          v-for="(log, i) in order.logs"
          :key="i"
          :timestamp="`${log.time} · ${log.user}`"
          placement="top"
          :type="log.action.includes('退回') ? 'danger' : log.action.includes('完成') ? 'success' : 'primary'"
        >
          <div class="log-action">{{ log.action }}</div>
          <div v-if="log.remark" class="log-remark">{{ log.remark }}</div>
        </el-timeline-item>
      </el-timeline>
    </el-card>

    <!-- 附件 -->
    <el-card shadow="never" class="block">
      <template #header><span class="block-title">附件</span></template>
      <div v-if="order.attachments.length" class="attachment-list">
        <div v-for="file in order.attachments" :key="file.name" class="attachment-item" @click="openAttachment(file)">
          <el-icon color="#1e88e5"><Paperclip /></el-icon>
          <span>{{ file.name }}</span>
        </div>
      </div>
      <el-empty v-else description="暂无附件" :image-size="70" />
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

  <!-- 加载中（order 为 null 且未确定不存在时，占位防闪"不存在"页） -->
  <div v-else-if="loading" v-loading="true" style="height: 300px" />

  <!-- 工单不存在 -->
  <el-result v-else-if="notFound" icon="warning" title="工单不存在或已被删除" sub-title="请返回列表重新选择">
    <template #extra>
      <el-button type="primary" @click="router.push('/work-orders')">返回工单列表</el-button>
    </template>
  </el-result>
</template>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  background: #fff;
  padding: 12px 16px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
}
.top-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 300px;
  min-width: 0;
  flex-wrap: wrap;
}
.order-title {
  font-size: 17px;
  font-weight: 600;
  color: #14487e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.top-right {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.block {
  margin-top: 16px;
  border-radius: 10px;
  border: none;
  box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
}
.block-title {
  font-size: 16px;
  font-weight: 600;
  color: #14487e;
}

.description-text {
  margin: 0;
  line-height: 1.8;
  color: #44607e;
  white-space: pre-wrap;
}
.overdue {
  color: #f56c6c;
  font-weight: 600;
}
.handler-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-action {
  font-weight: 600;
  color: #2c4a6b;
}
.log-remark {
  margin-top: 4px;
  font-size: 13px;
  color: #8499b0;
}

.attachment-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.attachment-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  padding: 6px 12px;
  border-radius: 6px;
  background: #f4f8fd;
  color: #1e88e5;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}
.attachment-item:hover {
  background: #e2f0fd;
}
</style>
