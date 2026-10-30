<script setup>
import { ref, onMounted } from 'vue'
import { Tickets, Clock, Check } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { listTickets } from '@/api/tickets'

const pendingList = ref([])
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const data = await listTickets({ status: 'pending_approval', perPage: 999 })
    pendingList.value = data.list || data || []
  } catch {
    ElMessage.warning('审批数据加载失败')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="approval-center">
    <div class="page-header">
      <h2><el-icon><Check /></el-icon> 待我审批</h2>
      <span class="sub">共 {{ pendingList.length }} 条待处理工单</span>
    </div>

    <el-table v-loading="loading" :data="pendingList" stripe class="approv-table">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
      <el-table-column prop="type" label="类型" width="120">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ row.type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="applicantName" label="申请人" width="120" />
      <el-table-column prop="createdAt" label="提交时间" width="180" />
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" :icon="Tickets" @click="$router.push(`/work-orders/${row.id}`)">
            查看详情
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: baseline;
  gap: 16px;
  margin-bottom: 16px;
}
.page-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #14487e;
  display: flex;
  align-items: center;
  gap: 8px;
}
.page-header .sub {
  font-size: 13px;
  color: #6b87a3;
}
.approv-table {
  background: #fff;
  border-radius: 8px;
  padding: 8px;
}
</style>
