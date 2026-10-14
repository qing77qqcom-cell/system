<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import {
  Tickets,
  Odometer,
  List,
  Avatar,
  Fold,
  Expand,
  ArrowDown,
  SwitchButton,
  UserFilled,
} from '@element-plus/icons-vue'
import { currentUser } from '@/utils/helpers'

const route = useRoute()
const router = useRouter()
const collapsed = ref(false)

// 工单相关页面统一高亮“工单列表”菜单
const activeMenu = computed(() =>
  route.path.startsWith('/work-orders') ? '/work-orders' : route.path,
)

const handleLogout = () => {
  ElMessageBox.confirm('确定要退出登录吗？', '退出确认', {
    confirmButtonText: '退出',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(() => {
      localStorage.removeItem('oa_token')
      router.push('/login')
    })
    .catch(() => { })
}
</script>

<template>
  <el-container class="layout">
    <!-- 侧边栏 -->
    <el-aside :width="collapsed ? '64px' : '220px'" class="sidebar">
      <div class="logo-area">
        <el-icon :size="26" class="logo-icon">
          <Tickets />
        </el-icon>
        <span v-show="!collapsed" class="logo-text">OA工单管理</span>
      </div>
      <el-menu :default-active="activeMenu" :collapse="collapsed" :collapse-transition="false" router class="side-menu">
        <el-menu-item index="/workbench">
          <el-icon>
            <Odometer />
          </el-icon>
          <template #title>工作台</template>
        </el-menu-item>
        <el-menu-item index="/work-orders">
          <el-icon>
            <List />
          </el-icon>
          <template #title>工单列表</template>
        </el-menu-item>
        <el-menu-item index="/usercontrol">
          <el-icon>
            <Avatar />
          </el-icon>
          <template #title>用户管理</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <!-- 顶栏 -->
      <el-header class="header">
        <div class="header-left">
          <el-icon class="collapse-btn" :size="18" @click="collapsed = !collapsed">
            <Fold v-if="!collapsed" />
            <Expand v-else />
          </el-icon>
          <span class="page-title">{{ route.meta.title || '工作台' }}</span>
        </div>
        <div class="header-right">
          <el-dropdown @command="(cmd) => cmd === 'logout' && handleLogout()">
            <span class="user-info">
              <el-icon :size="16">
                <UserFilled />
              </el-icon>
              <span class="username">{{ currentUser() }}</span>
              <el-icon :size="12">
                <ArrowDown />
              </el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout" :icon="SwitchButton">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 内容区 -->
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout {
  height: 100vh;
}

/* 侧边栏：深蓝渐变 */
.sidebar {
  background: linear-gradient(180deg, #155494 0%, #0e3f73 100%);
  transition: width 0.25s;
  overflow: hidden;
}

.logo-area {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #fff;
  white-space: nowrap;
}

.logo-icon {
  flex-shrink: 0;
  color: #8ec9ff;
}

.logo-text {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 1px;
}

.side-menu {
  border-right: none;
  background: transparent;
}

.side-menu :deep(.el-menu-item) {
  color: #c7def7;
  margin: 4px 12px;
  border-radius: 8px;
}

.side-menu :deep(.el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.side-menu :deep(.el-menu-item.is-active) {
  background: linear-gradient(135deg, #42a5f5 0%, #1e88e5 100%);
  color: #fff;
  box-shadow: 0 4px 12px rgba(30, 136, 229, 0.4);
}

.side-menu :deep(.el-menu--collapse .el-menu-item) {
  margin: 4px 8px;
}

/* 顶栏 */
.header {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #e6eef7;
  box-shadow: 0 1px 4px rgba(20, 72, 126, 0.05);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.collapse-btn {
  cursor: pointer;
  color: #5a7796;
}

.collapse-btn:hover {
  color: #1e88e5;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
  color: #14487e;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: #44607e;
  outline: none;
}

.username {
  font-size: 14px;
}

/* 内容区 */
.main {
  background: #f0f5fb;
  padding: 16px;
  overflow-y: auto;
}
</style>
