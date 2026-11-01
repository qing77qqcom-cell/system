<script setup>
/**
 * 通知待办 —— 三级菜单 tab 路由驱动页面
 *
 * 三角色共用此组件，通过 route.query.tab 区分：
 *   admin  → notice(公告) / todo(全局待办) / abnormal(异常告警) / sla(超时工单)
 *   leader → approval(待我审批) / dept(部门待办) / sla(超时预警) / notice(公告)
 *   staff  → todo(我的待办) / result(审批结果) / sla(超时提醒) / notice(公告)
 *
 * scopeSql 已按角色限制工单范围，前端只做额外 tab 筛选。
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BellFilled, ArrowRight, Refresh } from '@element-plus/icons-vue'
import {
  getMyTodo,
  listTickets,
  listAbnormalTickets,
  getStatsSlaDetails,
  getStatsOverview,
} from '@/api/tickets'
import { ANNOUNCEMENTS, STATUS_TEXT, STATUS_TAG_TYPE, PRIORITY_TAG_TYPE } from '@/constants'
import { useAuthStore } from '@/stores/store.js'
import { useLoading } from '@/composables/useLoading.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { loading, run } = useLoading()

const isAdmin = auth.isAdmin
const isLeader = auth.isLeader
const isStaff = !isAdmin && !isLeader

// ============ TAB 翻译表 ============
// 三角色各自可用的 tab + 对应的数据源 + 表格结构
const TAB_META = {
  // ======= 公共 =======
  notice: {
    title: '系统公告',
    roles: ['admin', 'leader', 'staff'],
    dataSource: null, // 只显示公告，不调接口
    kind: 'notice',
  },

  // ======= admin =======
  todo: {
    title: '全局待办',
    roles: ['admin', 'staff'],
    dataSource: 'todo',
    kind: 'todo', // handleList + approveList + financeList
  },
  abnormal: {
    title: '异常告警',
    roles: ['admin'],
    dataSource: 'abnormal',
    kind: 'ticketList',
    abnormalType: 'sla_breach',
  },
  sla: {
    title: '超时工单',
    roles: ['admin', 'leader', 'staff'],
    dataSource: 'slaDetails',
    kind: 'slaDetails',
  },

  // ======= leader =======
  approval: {
    title: '待我审批',
    roles: ['leader'],
    dataSource: 'approval',
    kind: 'todo', // 只取 approveList
  },
  dept: {
    title: '部门待办',
    roles: ['leader'],
    dataSource: 'deptTickets',
    kind: 'ticketList',
  },

  // ======= staff =======
  result: {
    title: '审批结果',
    roles: ['staff'],
    dataSource: 'myTickets',
    kind: 'ticketList',
  },
}

const tab = computed(() => route.query.tab || defaultTab.value)
const defaultTab = computed(() => {
  if (isAdmin) return 'todo'
  if (isLeader) return 'approval'
  return 'todo'
})
const currentMeta = computed(() => TAB_META[tab.value] || TAB_META[defaultTab.value])

// ============ 数据 ============
const todo = ref({ handleList: [], approveList: [], financeList: [] })
const ticketList = ref([])
const slaDetails = ref([])
const overview = ref({ total: 0, unclosed: 0 })
const error = ref(false)

// ============ 加载逻辑 ============
async function loadData() {
  error.value = false
  const meta = currentMeta.value
  if (meta.kind === 'notice') {
    // 公告 tab，不调接口
    return
  }
  await run(async () => {
    try {
      if (meta.dataSource === 'todo') {
        // 全局待办 / 我的待办 → /tickets/todo
        todo.value = await getMyTodo()
      } else if (meta.dataSource === 'approval') {
        // 待我审批（leader） → /tickets/todo 只取 approveList
        const all = await getMyTodo()
        todo.value = { handleList: [], approveList: all.approveList || [], financeList: [] }
      } else if (meta.dataSource === 'abnormal') {
        // 异常告警 → /tickets/abnormal
        ticketList.value = await listAbnormalTickets({ abnormalType: meta.abnormalType })
      } else if (meta.dataSource === 'deptTickets') {
        // 部门待办（leader scopeSql 已限制） → /tickets + status 筛选
        ticketList.value = await listTickets({ status: 'pending_processing' })
      } else if (meta.dataSource === 'myTickets') {
        // 审批结果（staff 我提交的） → /tickets + applicantId
        ticketList.value = await listTickets({ applicantId: auth.user?.id })
      } else if (meta.dataSource === 'slaDetails') {
        // SLA 超时明细 → /stats/sla/details
        slaDetails.value = await getStatsSlaDetails()
      }
    } catch (e) {
      console.error('[TodoPanel] 加载失败:', e)
      error.value = true
    }
  })
}

// ============ 工具 ============
const goDetail = (id) => router.push(`/work-orders/${id}`)

function msToHuman(ms) {
  if (!ms) return '—'
  const total = Math.round(ms / 1000)
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const parts = []
  if (d) parts.push(`${d}天`)
  if (h) parts.push(`${h}小时`)
  if (m) parts.push(`${m}分钟`)
  return parts.join('') || '<1分钟'
}

function openPortal(name) {
  ElMessage.info(`「${name}」为演示入口，暂未接入实际模块`)
}

// ============ 生命周期 ============
watch(() => route.query.tab, () => loadData())
loadData()
</script>

<template>
  <div class="todo-panel">

    <!-- ============ 公告 tab ============ -->
    <template v-if="currentMeta.kind === 'notice'">
      <el-card shadow="never" class="panel">
        <template #header>
          <div class="panel-header">
            <span class="panel-title">系统公告</span>
            <el-icon class="panel-bell"><BellFilled /></el-icon>
          </div>
        </template>
        <ul class="notice-list">
          <li v-for="notice in ANNOUNCEMENTS" :key="notice.id" @click="openPortal('公告详情')">
            <span class="notice-dot"></span>
            <span class="notice-title">{{ notice.title }}</span>
            <span class="notice-date">{{ notice.date }}</span>
          </li>
        </ul>
      </el-card>
    </template>

    <!-- ============ 待办 tab（todo / approval） ============ -->
    <template v-else-if="currentMeta.kind === 'todo'">
      <el-card shadow="never" class="panel">
        <template #header>
          <div class="panel-header">
            <span class="panel-title">{{ currentMeta.title }}</span>
            <el-button text type="primary" @click="router.push('/work-orders')">
              查看全部<el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </template>

        <div v-if="!loading && !error">
          <!-- handleList -->
          <div v-if="todo.handleList?.length" class="todo-group">
            <div class="todo-group-title">
              {{ isLeader ? '部门待分配 / 我的处理中' : '待我处理 / 我申请的待确认' }}
              （{{ todo.handleList.length }}）
            </div>
            <el-table :data="todo.handleList" size="small" @row-click="(row) => goDetail(row.id)" class="todo-table">
              <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
              <el-table-column label="类型" width="90">
                <template #default="{ row }">
                  <el-tag size="small">
                    {{ row.type === 'fault_repair' ? '故障' : row.type === 'account_permission' ? '账号' : row.type === 'expense_reimbursement' ? '报销' : '其他' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="优先级" width="72">
                <template #default="{ row }">
                  <el-tag :type="PRIORITY_TAG_TYPE[row.priority]" size="small">{{ row.priority }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="88">
                <template #default="{ row }">
                  <el-tag :type="STATUS_TAG_TYPE[row.status]" size="small">{{ STATUS_TEXT[row.status] ?? row.status }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="申请人" width="90">
                <template #default="{ row }">{{ row.applicant ?? row.applicant_name ?? '—' }}</template>
              </el-table-column>
            </el-table>
          </div>

          <!-- approveList -->
          <div v-if="todo.approveList?.length" class="todo-group">
            <div class="todo-group-title">待我审批（{{ todo.approveList.length }}）</div>
            <el-table :data="todo.approveList" size="small" @row-click="(row) => goDetail(row.id)" class="todo-table">
              <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
              <el-table-column label="类型" width="90">
                <template #default="{ row }">
                  <el-tag size="small">
                    {{ row.type === 'fault_repair' ? '故障' : row.type === 'account_permission' ? '账号' : row.type === 'expense_reimbursement' ? '报销' : '其他' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="申请人" width="90">
                <template #default="{ row }">{{ row.applicant ?? row.applicant_name ?? '—' }}</template>
              </el-table-column>
              <el-table-column label="优先级" width="72">
                <template #default="{ row }">
                  <el-tag :type="PRIORITY_TAG_TYPE[row.priority]" size="small">{{ row.priority }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="createdAt" label="创建时间" width="150" />
            </el-table>
          </div>

          <!-- financeList（仅 admin） -->
          <div v-if="todo.financeList?.length && isAdmin" class="todo-group">
            <div class="todo-group-title finance">内置财务部待办（{{ todo.financeList.length }}）</div>
            <el-table :data="todo.financeList" size="small" @row-click="(row) => goDetail(row.id)" class="todo-table">
              <el-table-column prop="title" label="报销单" min-width="200" show-overflow-tooltip />
              <el-table-column label="金额" width="110">
                <template #default="{ row }">¥ {{ row.extra?.amount ?? '—' }}</template>
              </el-table-column>
              <el-table-column label="申请人" width="90">
                <template #default="{ row }">{{ row.applicant ?? row.applicant_name ?? '—' }}</template>
              </el-table-column>
            </el-table>
          </div>

          <el-empty v-if="!todo.handleList?.length && !todo.approveList?.length && !todo.financeList?.length"
            description="暂无待办工单，太棒了！" :image-size="80" />
        </div>

        <el-result v-if="error" icon="error" title="加载失败" sub-title="请稍后重试">
          <template #extra>
            <el-button type="primary" @click="loadData">重新加载</el-button>
          </template>
        </el-result>
      </el-card>
    </template>

    <!-- ============ 通用工单列表 tab（abnormal / deptTickets / myTickets） ============ -->
    <template v-else-if="currentMeta.kind === 'ticketList'">
      <el-card shadow="never" class="panel">
        <template #header>
          <div class="panel-header">
            <span class="panel-title">{{ currentMeta.title }}</span>
            <el-button text size="small" :icon="Refresh" @click="loadData">刷新</el-button>
          </div>
        </template>

        <el-table v-loading="loading" :data="ticketList" border stripe size="small" class="todo-table">
          <el-table-column prop="id" label="编号" width="150" />
          <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <el-link type="primary" underline="never" @click="goDetail(row.id)">{{ row.title }}</el-link>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="90">
            <template #default="{ row }">
              <el-tag size="small">
                {{ row.type === 'fault_repair' ? '故障' : row.type === 'account_permission' ? '账号' : row.type === 'expense_reimbursement' ? '报销' : row.type }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="STATUS_TAG_TYPE[row.status]" size="small">{{ STATUS_TEXT[row.status] ?? row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="优先级" width="72">
            <template #default="{ row }">
              <el-tag :type="PRIORITY_TAG_TYPE[row.priority]" size="small">{{ row.priority }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="申请人" width="90">
            <template #default="{ row }">{{ row.applicant ?? row.applicant_name ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="处理人" width="90">
            <template #default="{ row }">{{ row.handler ?? row.handler_name ?? '—' }}</template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="150" />
          <el-table-column label="异常标签" v-if="currentMeta.dataSource === 'abnormal'" width="110">
            <template #default="{ row }">
              <el-tag v-for="tag in (row.abnormalTags || [])" :key="tag" type="danger" effect="dark" size="small" style="margin-right:4px">
                {{ tag === 'sla_breach' ? 'SLA超时' : tag === 'escalated' ? '已升级' : tag === 'sla_exempt' ? '豁免SLA' : tag === 'long_suspended' ? '长挂起' : tag }}
              </el-tag>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="暂无数据" :image-size="80" />
          </template>
        </el-table>
      </el-card>
    </template>

    <!-- ============ SLA 超时明细 tab ============ -->
    <template v-else-if="currentMeta.kind === 'slaDetails'">
      <el-card shadow="never" class="panel">
        <template #header>
          <div class="panel-header">
            <span class="panel-title">{{ currentMeta.title }}</span>
            <el-button text size="small" :icon="Refresh" @click="loadData">刷新</el-button>
          </div>
        </template>

        <el-table v-loading="loading" :data="slaDetails" border stripe size="small" class="todo-table">
          <el-table-column prop="ticketId" label="工单编号" width="180">
            <template #default="{ row }">
              <el-link type="primary" underline="never" @click="goDetail(row.ticketId)">{{ row.ticketId }}</el-link>
            </template>
          </el-table-column>
          <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
          <el-table-column label="超时指标" width="130">
            <template #default="{ row }">
              <el-tag type="danger" size="small">{{ row.metricType === 'first_response' ? '首次响应' : row.metricType === 'resolution' ? '解决时效' : row.metricType }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="超时时长" width="140">
            <template #default="{ row }">
              <span style="color:#f56c6c;font-weight:600">{{ msToHuman(row.breachedDuration) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="handlerName" label="处理人" width="90" />
          <el-table-column prop="dept" label="部门" width="100" />
          <template #empty>
            <el-empty description="暂无超时工单 🎉" :image-size="80" />
          </template>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.todo-panel {
  padding: 0;
}

.panel {
  margin-top: 16px;
  border-radius: 10px;
  border: none;
  box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: #14487e;
}
.panel-bell { color: #e6a23c; }

.todo-group { margin-bottom: 14px; }
.todo-group:last-child { margin-bottom: 0; }
.todo-group-title {
  font-size: 13px;
  color: #44607e;
  font-weight: 600;
  padding: 6px 0 8px;
  border-bottom: 1px dashed #e8eef5;
}
.todo-group-title.finance { color: #f56c6c; }
.todo-table { cursor: pointer; }

.notice-list { margin: 0; padding: 0; list-style: none; }
.notice-list li {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px dashed #e8eef5;
  cursor: pointer;
  font-size: 13px;
}
.notice-list li:last-child { border-bottom: none; }
.notice-list li:hover .notice-title { color: #1e88e5; }
.notice-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #1e88e5;
  margin-right: 10px;
  flex-shrink: 0;
}
.notice-title {
  flex: 1;
  color: #44607e;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.2s;
}
.notice-date {
  margin-left: 10px;
  color: #a3b5c7;
  font-size: 12px;
}
</style>
