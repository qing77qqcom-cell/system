<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  Sunny,
  Clock,
  Loading,
  WarningFilled,
  CircleCheckFilled,
  BellFilled,
  ArrowRight,
  Monitor,
  Document,
  Grid,
} from '@element-plus/icons-vue'
import { useWorkOrderStore } from '@/stores/workOrder'
import { ANNOUNCEMENTS, PRIORITY_TAG_TYPE, STATUS_TAG_TYPE } from '@/mock/data'
import { currentUser, greeting, isOverdue } from '@/utils/helpers'

const router = useRouter()
const store = useWorkOrderStore()

const stats = computed(() => [
  { label: '待处理工单', value: store.stats.pending, icon: Clock, color: '#1e88e5', bg: '#e8f3fe' },
  { label: '处理中', value: store.stats.processing, icon: Loading, color: '#e6a23c', bg: '#fdf6ec' },
  { label: '已逾期', value: store.stats.overdue, icon: WarningFilled, color: '#f56c6c', bg: '#fef0f0' },
  {
    label: '本月已完成',
    value: store.stats.monthDone,
    icon: CircleCheckFilled,
    color: '#67c23a',
    bg: '#f0f9eb',
  },
])

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

    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stat-row">
      <el-col v-for="item in stats" :key="item.label" :span="6">
        <div class="stat-card">
          <div class="stat-icon" :style="{ background: item.bg, color: item.color }">
            <el-icon :size="26">
              <component :is="item.icon" />
            </el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value" :style="{ color: item.color }">{{ item.value }}</div>
            <div class="stat-label">{{ item.label }}</div>
          </div>
        </div>
      </el-col>
    </el-row>

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

.stat-row {
  margin-top: 16px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(20, 72, 126, 0.06);
  transition: transform 0.2s;
}

.stat-card:hover {
  transform: translateY(-3px);
}

.stat-icon {
  width: 54px;
  height: 54px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
}

.stat-label {
  margin-top: 2px;
  font-size: 13px;
  color: #7d93aa;
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
