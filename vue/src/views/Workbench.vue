<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Sunny,
  BellFilled,
  ArrowRight,
  Monitor,
  Document,
  Grid,
} from '@element-plus/icons-vue'
import { useWorkOrderStore } from '@/stores/workOrder'
import { getStatsOverview } from '@/api/stats'
import { ANNOUNCEMENTS, PRIORITY_TAG_TYPE, STATUS_TAG_TYPE } from '@/mock/data'
import { currentUser, greeting, isOverdue } from '@/utils/helpers'
import BaseChart from '@/components/BaseChart.vue'

const router = useRouter()
const store = useWorkOrderStore()

// 工单状态统计（来自后端 /api/stats/overview，按角色范围统计全部工单）
const stats = ref({ pending: 0, processing: 0, completed: 0, closed: 0, returned: 0 })

onMounted(async () => {
  stats.value = await getStatsOverview()
})

// 工单状态分布（环形饼图）：5 个状态互斥，合计 = 范围内全部工单
// 颜色与列表页 el-tag 的状态配色保持一致
const pieOption = computed(() => ({
  tooltip: { trigger: 'item', formatter: '{b}：{c} 条（{d}%）' },
  legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8 },
  series: [
    {
      name: '工单状态',
      type: 'pie',
      radius: ['42%', '68%'],
      center: ['50%', '44%'],
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{c} 条' },
      data: [
        { name: '待处理', value: stats.value.pending, itemStyle: { color: '#e6a23c' } },
        { name: '处理中', value: stats.value.processing, itemStyle: { color: '#1e88e5' } },
        { name: '已完成', value: stats.value.completed, itemStyle: { color: '#67c23a' } },
        { name: '已关闭', value: stats.value.closed, itemStyle: { color: '#909399' } },
        { name: '已退回', value: stats.value.returned, itemStyle: { color: '#f56c6c' } },
      ],
    },
  ],
}))

const todayText = computed(() => {
  const d = new Date()
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 星期${week}`
})

const todos = computed(() => store.todoList.slice(0, 5))

const goDetail = (id) => router.push(`/work-orders/${id}`)

const openPortal = (name) => ElMessage.info(`「${name}」为演示入口，暂未接入实际模块`)
</script>

<template>
  <div class="workbench">
    <!-- 问候卡片 -->
    <div class="hello-card">
      <div class="hello-left">
        <div class="hello-text">{{ greeting() }}，{{ currentUser() }}</div>
        <div class="hello-date">{{ todayText }}</div>
        <div class="hello-tip">欢迎使用 OA 企业工单管理系统，今天也要高效处理工单哦～</div>
      </div>
      <el-icon :size="72" class="hello-icon">
        <Sunny />
      </el-icon>
    </div>

    <!-- 工单状态饼图 -->
    <el-card shadow="never" class="panel">
      <template #header>
        <div class="panel-header">
          <span class="panel-title">工单状态总览</span>
          <el-button text type="primary" @click="router.push('/work-orders')">
            查看全部<el-icon class="el-icon--right">
              <ArrowRight />
            </el-icon>
          </el-button>
        </div>
      </template>
      <BaseChart :option="pieOption" height="320px" />
    </el-card>

    <el-row :gutter="16">
      <!-- 我的待办 -->
      <el-col :span="16">
        <el-card shadow="never" class="panel">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">我的待办</span>
              <el-button text type="primary" @click="router.push('/work-orders')">
                查看全部<el-icon class="el-icon--right">
                  <ArrowRight />
                </el-icon>
              </el-button>
            </div>
          </template>
          <el-table :data="todos" size="small" @row-click="goDetail" class="todo-table">
            <el-table-column prop="id" label="工单编号" width="150" />
            <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
            <el-table-column label="优先级" width="80">
              <template #default="{ row }">
                <el-tag :type="PRIORITY_TAG_TYPE[row.priority]" size="small">{{ row.priority }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="deadline" label="截止时间" width="140" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="STATUS_TAG_TYPE[row.status]" size="small">{{ row.status }}</el-tag>
                <el-tag v-if="isOverdue(row)" type="danger" size="small" effect="dark" class="overdue-tag">
                  逾期
                </el-tag>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty description="暂无待办工单，太棒了！" :image-size="80" />
            </template>
          </el-table>
        </el-card>
      </el-col>

      <!-- 公告 -->
      <el-col :span="8">
        <el-card shadow="never" class="panel">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">公告</span>
              <el-icon class="panel-bell">
                <BellFilled />
              </el-icon>
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

    <!-- 快捷入口 -->
    <el-card shadow="never" class="panel portal-panel">
      <template #header>
        <span class="panel-title">快捷入口</span>
      </template>
      <div class="portal-list">
        <div class="portal-item" @click="openPortal('OA门户')">
          <el-icon :size="26" color="#1e88e5">
            <Monitor />
          </el-icon>
          <span>OA门户</span>
        </div>
        <div class="portal-item" @click="openPortal('新闻公告')">
          <el-icon :size="26" color="#e6a23c">
            <Document />
          </el-icon>
          <span>新闻公告</span>
        </div>
        <div class="portal-item" @click="router.push('/work-orders')">
          <el-icon :size="26" color="#67c23a">
            <Grid />
          </el-icon>
          <span>业务模块</span>
        </div>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.hello-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26px 30px;
  border-radius: 12px;
  color: #fff;
  background: linear-gradient(120deg, #1e88e5 0%, #42a5f5 60%, #64b5f6 100%);
  box-shadow: 0 8px 20px rgba(30, 136, 229, 0.25);
}

.hello-text {
  font-size: 24px;
  font-weight: 600;
}

.hello-date {
  margin-top: 8px;
  font-size: 13px;
  opacity: 0.9;
}

.hello-tip {
  margin-top: 6px;
  font-size: 13px;
  opacity: 0.85;
}

.hello-icon {
  opacity: 0.55;
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

.panel-bell {
  color: #e6a23c;
}

.todo-table {
  cursor: pointer;
}

.overdue-tag {
  margin-left: 4px;
}

.notice-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.notice-list li {
  display: flex;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px dashed #e8eef5;
  cursor: pointer;
  font-size: 13px;
}

.notice-list li:last-child {
  border-bottom: none;
}

.notice-list li:hover .notice-title {
  color: #1e88e5;
}

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

.portal-list {
  display: flex;
  gap: 40px;
}

.portal-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 110px;
  padding: 16px 0;
  border-radius: 10px;
  cursor: pointer;
  color: #44607e;
  font-size: 14px;
  transition: background 0.2s;
}

.portal-item:hover {
  background: #eaf4fe;
}
</style>
