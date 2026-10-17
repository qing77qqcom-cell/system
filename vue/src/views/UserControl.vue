<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Back } from '@element-plus/icons-vue'
import { getUser } from '@/api/user'
import { listOrders } from '@/api/order'
import { getStatsOverview } from '@/api/stats'
import { PRIORITY_TAG_TYPE, ROLE_TAG_TYPE, STATUS_TAG_TYPE, USER_STATUS_TAG_TYPE } from '@/constants'

const route = useRoute()
const router = useRouter()

// reactive 对象：接口返回后一次性 Object.assign 灌进来
const user = reactive({
  id: 0,
  name: '',
  role: '',
  dept: '',
  email: '',
  username: '',
  status: '',
  createdAt: '',
})

// 用户提交的工单（后端接口数据）
const myOrders = ref([])

// 工单统计（后端聚合接口直接返回，省得前端遍历工单列表再算）
const stats = ref([
  { label: '提交工单', value: 0 },
  { label: '待处理', value: 0 },
  { label: '处理中', value: 0 },
  { label: '已完成', value: 0 },
  { label: '逾期', value: 0 },
])

// 按路由 id 调后端接口拿详情、统计与工单列表
onMounted(async () => {
  try {
    const data = await getUser(route.params.id)
    Object.assign(user, data)
  } catch {
    return // 用户不存在或无权查看，user.id 保持 0，模板走空状态
  }
  // 并行拉统计和工单列表（两个独立请求）
  await Promise.allSettled([
    (async () => {
      const s = await getStatsOverview({ submitterId: user.id })
      stats.value = [
        { label: '提交工单', value: s.total },
        { label: '待处理', value: s.pending },
        { label: '处理中', value: s.processing },
        { label: '已完成', value: s.completed },
        { label: '逾期', value: s.overdue },
      ]
    })(),
    (async () => {
      myOrders.value = await listOrders({ submitterId: user.id })
    })(),
  ])
})
</script>

<template>
  <div v-if="user.id" class="user-detail">
    <!-- 顶部返回 -->
    <div class="top-bar">
      <el-button text :icon="Back" @click="router.back()">返回</el-button>
    </div>

    <!-- 个人信息卡 -->
    <el-card shadow="never" class="block">
      <div class="profile">
        <el-avatar :size="64" class="avatar">{{ user.name.charAt(0) }}</el-avatar>
        <div class="profile-main">
          <div class="profile-name">
            <span class="name">{{ user.name }}</span>
            <el-tag :type="ROLE_TAG_TYPE[user.role]" size="small">{{ user.role }}</el-tag>
            <el-tag :type="USER_STATUS_TAG_TYPE[user.status]" size="small">{{ user.status }}</el-tag>
          </div>
          <div class="profile-sub">
            账号：{{ user.username }}<span class="divider">|</span>{{ user.dept || '无部门' }}<span class="divider">|</span>{{
              user.email }}
          </div>
        </div>
      </div>

      <el-descriptions :column="3" border class="info">
        <el-descriptions-item label="账号">{{ user.username }}</el-descriptions-item>
        <el-descriptions-item label="姓名">{{ user.name }}</el-descriptions-item>
        <el-descriptions-item label="角色">{{ user.role }}</el-descriptions-item>
        <el-descriptions-item label="所属部门">{{ user.dept || '—' }}</el-descriptions-item>
        <el-descriptions-item label="邮箱">{{ user.email }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ user.createdAt }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 工单统计 -->
    <div class="stats">
      <div v-for="s in stats" :key="s.label" class="stat-item">
        <div class="stat-value">{{ s.value }}</div>
        <div class="stat-label">{{ s.label }}</div>
      </div>
    </div>

    <!-- 提交的工单 -->
    <el-card shadow="never" class="block">
      <template #header>
        <span class="block-title">提交的工单（{{ myOrders.length }}）</span>
      </template>
      <el-table :data="myOrders" border stripe style="width: 100%">
        <el-table-column prop="id" label="编号" width="150" />
        <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <el-link type="primary" underline="never" @click="router.push(`/work-orders/${row.id}`)">
              {{ row.title }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column prop="type" label="问题类型" width="100" />
        <el-table-column prop="handler" label="处理人" width="90">
          <template #default="{ row }">{{ row.handler || '—' }}</template>
        </el-table-column>
        <el-table-column label="优先级" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="PRIORITY_TAG_TYPE[row.priority]" size="small">{{ row.priority }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="STATUS_TAG_TYPE[row.status]" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="150" />
        <template #empty>
          <el-empty description="该用户暂无工单记录" :image-size="80" />
        </template>
      </el-table>
    </el-card>
  </div>

  <!-- 用户不存在 -->
  <el-result v-else icon="warning" title="用户不存在或已被删除" sub-title="请返回列表重新选择">
    <template #extra>
      <el-button type="primary" @click="router.replace('/systemcontrol/usercontrol')">返回用户列表</el-button>
    </template>
  </el-result>
</template>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.block {
  border-radius: 10px;
  border: none;
  box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
}

/* 个人信息 */
.profile {
  display: flex;
  align-items: center;
  gap: 16px;
}

.avatar {
  flex-shrink: 0;
  font-size: 26px;
  color: #fff;
  background: linear-gradient(135deg, #42a5f5 0%, #1e88e5 100%);
}

.profile-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.name {
  font-size: 20px;
  font-weight: 600;
  color: #14487e;
}

.profile-sub {
  margin-top: 6px;
  font-size: 13px;
  color: #7a93ad;
}

.divider {
  margin: 0 10px;
  color: #d5e2ef;
}

.info {
  margin-top: 16px;
}

/* 工单统计 */
.stats {
  display: flex;
  gap: 16px;
  margin: 16px 0;
}

.stat-item {
  flex: 1;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
  padding: 16px 0;
  text-align: center;
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: #1e88e5;
}

.stat-label {
  margin-top: 4px;
  font-size: 13px;
  color: #7a93ad;
}

.block-title {
  font-size: 16px;
  font-weight: 600;
  color: #14487e;
}
</style>
