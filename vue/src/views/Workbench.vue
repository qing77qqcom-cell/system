<script setup>
// 工作台：问候卡 + MenuLayout(横向二级 + AsideBar二级/三级 + router-view)
// 菜单布局逻辑全在 MenuLayout.vue，这里只管问候卡
import { computed } from 'vue'
import { Sunny } from '@element-plus/icons-vue'
import { greeting } from '@/utils/helpers'
import { useAuthStore } from '@/stores/store.js'
import MenuLayout from '@/components/layout/MenuLayout.vue'

const auth = useAuthStore()
const user = auth.user

const todayText = computed(() => {
  const d = new Date()
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 星期${week}`
})
</script>

<template>
  <MenuLayout top-index="/workbench">
    <!-- 顶部问候卡（MenuLayout header slot） -->
    <template #header>
      <div class="hello-card">
        <div class="hello-left">
          <div class="hello-text">{{ greeting() }}，{{ auth.userName }}</div>
          <div class="hello-sub">
            <el-tag effect="dark" type="primary" class="role-tag">{{ user?.role }}</el-tag>
            <span v-if="user?.dept" class="hello-dept">· {{ user.dept }}</span>
            <span class="hello-dept">· {{ todayText }}</span>
          </div>
        </div>
        <el-icon :size="72" class="hello-icon">
          <Sunny />
        </el-icon>
      </div>
    </template>
  </MenuLayout>
</template>

<style scoped>
.hello-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22px 28px;
  border-radius: 12px;
  color: #fff;
  background: linear-gradient(120deg, #1e88e5 0%, #42a5f5 60%, #64b5f6 100%);
  box-shadow: 0 8px 20px rgba(30, 136, 229, 0.25);
}
.hello-text { font-size: 22px; font-weight: 600; }
.hello-sub { margin-top: 6px; display: flex; align-items: center; gap: 10px; font-size: 13px; opacity: 0.95; }
.role-tag { background: rgba(255,255,255,0.2); border: none; }
.hello-dept { opacity: 0.85; }
.hello-icon { opacity: 0.55; }
</style>
