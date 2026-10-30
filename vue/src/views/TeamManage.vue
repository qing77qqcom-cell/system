<script setup>
import { ref, onMounted } from 'vue'
import { UserFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/store.js'

const auth = useAuthStore()
const members = ref([])
const loading = ref(false)

// TODO: 后端 /api/users?role=技术部普通员工&dept=当前用户部门 接口就绪后替换
onMounted(async () => {
  loading.value = true
  try {
    // 暂时用 users 列表按部门过滤
    const { default: axios } = await import('@/utils/request')
    const all = await axios.get('/users')
    const me = auth.user
    members.value = (Array.isArray(all) ? all : all.list || []).filter(
      (u) => u.dept === me?.dept && u.id !== me?.id
    )
  } catch {
    members.value = []
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="team-manage">
    <div class="page-header">
      <h2><el-icon><UserFilled /></el-icon> 团队成员 · {{ auth.user?.dept }}</h2>
      <span class="sub">共 {{ members.length }} 位下属</span>
    </div>

    <div v-loading="loading" class="member-grid">
      <div v-for="m in members" :key="m.id" class="member-card">
        <el-avatar :size="48" :style="{ background: '#8ec9ff', color: '#fff' }">
          {{ (m.name || '?')[0] }}
        </el-avatar>
        <div class="member-info">
          <div class="name">{{ m.name }}</div>
          <div class="role">{{ m.role }}</div>
        </div>
        <el-button size="small" link type="primary" @click="$router.push(`/usercontrol/${m.id}`)">
          查看详情
        </el-button>
      </div>

      <el-empty v-if="!loading && members.length === 0" description="暂无团队成员" />
    </div>
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

.member-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  background: #fff;
  border-radius: 8px;
  padding: 16px;
}
.member-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e6eef7;
  border-radius: 8px;
  transition: box-shadow 0.2s;
}
.member-card:hover { box-shadow: 0 2px 10px rgba(20,72,126,0.1); }
.member-info .name { font-weight: 600; color: #14487e; }
.member-info .role { font-size: 12px; color: #6b87a3; margin-top: 2px; }
</style>
