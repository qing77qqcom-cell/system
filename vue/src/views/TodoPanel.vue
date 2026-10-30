<script setup>
// 通知待办子页面：快捷指标卡 + 我的待办 + 公告 + 快捷入口
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { BellFilled, ArrowRight, Monitor, Document, Grid } from '@element-plus/icons-vue'
import { getStatsOverview, getMyTodo } from '@/api/tickets'
import { ANNOUNCEMENTS, STATUS_TEXT, STATUS_TAG_TYPE, PRIORITY_TAG_TYPE } from '@/constants'
import { useAuthStore } from '@/stores/store.js'
import { useLoading } from '@/composables/useLoading.js'

const router = useRouter()
const auth = useAuthStore()
const { loading, run } = useLoading()
const isAdmin = auth.isAdmin
const isLeader = auth.isLeader
const roleScope = isAdmin ? '全局' : isLeader ? '本部门' : '个人'

// ------ 数据 ------
const overview = ref({ total: 0, created: 0, closed: 0, unclosed: 0, cancelled: 0, rejected: 0 })
const todo = ref({ handleList: [], approveList: [], financeList: [] })

// 快捷指标卡
const metricCards = computed(() => [
  { label: `${roleScope}工单总数`, value: overview.value.total, color: '#1e88e5' },
  { label: '本周期新增', value: overview.value.created, color: '#42a5f5' },
  { label: '未完结工单', value: overview.value.unclosed, color: '#e6a23c' },
  { label: '周期内已关闭', value: overview.value.closed, color: '#67c23a' },
  { label: '已取消', value: overview.value.cancelled, color: '#909399' },
  { label: '审批驳回', value: overview.value.rejected, color: '#f56c6c' },
])

const goDetail = (id) => router.push(`/work-orders/${id}`)
const openPortal = (name) => ElMessage.info(`「${name}」为演示入口，暂未接入实际模块`)

onMounted(async () => {
  await run(async () => {
    try {
      const [overviewData, todoData] = await Promise.all([
        getStatsOverview(),
        getMyTodo(),
      ])
      overview.value = overviewData
      todo.value = todoData
    } catch (e) {
      console.error('[TodoPanel] 加载失败:', e)
    }
  })
})
</script>

<template>
  <div class="todo-panel">

    <el-row :gutter="16">
      <!-- 左侧：主待办区 -->
      <el-col :span="24">
        <el-card shadow="never" class="panel">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">我的待办</span>
              <el-button text type="primary" @click="router.push('/work-orders')">
                查看全部<el-icon class="el-icon--right"><ArrowRight /></el-icon>
              </el-button>
            </div>
          </template>
          <template v-if="todo.handleList?.length || todo.approveList?.length || todo.financeList?.length">
            <div v-if="todo.handleList?.length" class="todo-group">
              <div class="todo-group-title">待我处理 / 我申请的待确认（{{ todo.handleList.length }}）</div>
              <el-table :data="todo.handleList" size="small" @row-click="(row) => goDetail(row.id)" class="todo-table">
                <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
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
              </el-table>
            </div>
            <div v-if="todo.approveList?.length" class="todo-group">
              <div class="todo-group-title">待我审批（{{ todo.approveList.length }}）</div>
              <el-table :data="todo.approveList" size="small" @row-click="(row) => goDetail(row.id)" class="todo-table">
                <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
                <el-table-column label="类型" width="90">
                  <template #default="{ row }">
                    <el-tag :type="row.type === 'reimbursement' ? 'success' : row.type === 'account_permission' ? 'info' : 'warning'" size="small">
                      {{ row.type === 'fault_repair' ? '故障' : row.type === 'account_permission' ? '账号' : '报销' }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="申请人" width="90">
                  <template #default="{ row }">{{ row.applicant ?? '—' }}</template>
                </el-table-column>
              </el-table>
            </div>
            <div v-if="todo.financeList?.length && isAdmin" class="todo-group">
              <div class="todo-group-title finance">内置财务部待办（{{ todo.financeList.length }}）</div>
              <el-table :data="todo.financeList" size="small" @row-click="(row) => goDetail(row.id)" class="todo-table">
                <el-table-column prop="title" label="报销单" min-width="180" show-overflow-tooltip />
                <el-table-column label="金额" width="110">
                  <template #default="{ row }">¥ {{ row.extra?.amount ?? '—' }}</template>
                </el-table-column>
              </el-table>
            </div>
          </template>
          <el-empty v-else description="暂无待办工单，太棒了！" :image-size="80" />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <!-- 公告 -->
      <el-col :span="isAdmin || isLeader ? 16 : 24">
        <el-card shadow="never" class="panel">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">公告</span>
              <el-icon class="panel-bell"><BellFilled /></el-icon>
            </div>
          </template>
          <ul class="notice-list">
            <li v-for="notice in ANNOUNCEMENTS" :key="notice.id" @click="openPortal('公告详情')">
              <span class="notice-dot"></span>
              <span class="notice-title">{{ notice.title }}</span>
              <span class="notice-date">{{ notice.date.slice(5) }}</span>
            </li>
          </ul>
        </el-card>
      </el-col>


    </el-row>
  </div>
</template>

<style scoped>
.metric-row { margin-bottom: 0; }
.metric-card {
  background: #fff;
  border-radius: 10px;
  padding: 16px 18px;
  border-top: 3px solid #eee;
  box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
  margin-bottom: 12px;
}
.metric-label { font-size: 13px; color: #606266; }
.metric-value { font-size: 28px; font-weight: 600; margin-top: 4px; }

.panel {
  margin-top: 16px;
  border-radius: 10px;
  border: none;
  box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
}
.panel-header { display: flex; align-items: center; justify-content: space-between; }
.panel-title { font-size: 16px; font-weight: 600; color: #14487e; }
.panel-bell { color: #e6a23c; }

.todo-group { margin-bottom: 12px; }
.todo-group-title {
  font-size: 13px; color: #44607e; font-weight: 600;
  padding: 6px 0 8px; border-bottom: 1px dashed #e8eef5;
}
.todo-group-title.finance { color: #f56c6c; }
.todo-table { cursor: pointer; }

.notice-list { margin: 0; padding: 0; list-style: none; }
.notice-list li {
  display: flex; align-items: center; padding: 10px 0;
  border-bottom: 1px dashed #e8eef5; cursor: pointer; font-size: 13px;
}
.notice-list li:last-child { border-bottom: none; }
.notice-list li:hover .notice-title { color: #1e88e5; }
.notice-dot { width: 6px; height: 6px; border-radius: 50%; background: #1e88e5; margin-right: 10px; flex-shrink: 0; }
.notice-title { flex: 1; color: #44607e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: color 0.2s; }
.notice-date { margin-left: 10px; color: #a3b5c7; font-size: 12px; }

.portal-list { display: flex; gap: 40px; justify-content: center; }
.portal-item {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  width: 110px; padding: 16px 0; border-radius: 10px;
  cursor: pointer; color: #44607e; font-size: 14px; transition: background 0.2s;
}
.portal-item:hover { background: #eaf4fe; }
</style>
