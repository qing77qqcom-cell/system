<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Tickets, ArrowDown, SwitchButton, UserFilled, Menu as MenuIcon, Close } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/store.js'
import { logout as apiLogout } from '@/api/user'
import { ROLE_MENU_TREE } from '@/schema/menu-config'
import { useMobile } from '@/composables/useMobile.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { isMobile } = useMobile()

// ———————— 一级菜单（和之前一模一样）————————
const visibleNavs = computed(() => {
  const roleMenus = ROLE_MENU_TREE[auth.role] || []
  return roleMenus.map((m) => ({ index: m.index, title: m.title, icon: m.icon }))
})

const activeMenu = computed(() => {
  const p = route.path
  if (p.startsWith('/workbench')) return '/workbench'
  if (p.startsWith('/work-orders/create')) return '/work-orders/create'
  if (p.startsWith('/work-orders')) return '/workbench'
  if (p.startsWith('/approval-center')) return '/approval-center'
  if (p.startsWith('/team-manage')) return '/team-manage'
  if (p.startsWith('/help')) return '/help'
  if (p.startsWith('/usercontrol')) {
    return auth.user?.id ? `/usercontrol/${auth.user.id}` : p
  }
  if (p.startsWith('/systemcontrol')) return '/systemcontrol'
  return p
})

// ———————— 移动端抽屉菜单状态 ————————
const drawerOpen = ref(false)
// 路由切换时自动关闭抽屉（移动端体验：点菜单 → 跳转 → 收起抽屉）
watch(() => route.fullPath, () => { drawerOpen.value = false })
// 从手机切回 PC 时关掉抽屉，避免桌面端还挂着
watch(isMobile, (v) => { if (!v) drawerOpen.value = false })

function onMobileNavClick(nav) {
  drawerOpen.value = false
  if (nav.index !== route.path) router.push(nav.index)
}

const handleLogout = () => {
  ElMessageBox.confirm('确定要退出登录吗？', '退出确认', {
    confirmButtonText: '退出',
    cancelButtonText: '取消',
    type: 'warning',
    center: true,
  })
    .then(async () => {
      try { await apiLogout() } catch { /* 后端登出失败不阻塞前端 */ }
      auth.logout()
      router.push('/login')
    })
    .catch(() => { /* 用户点取消 */ })
}
</script>

<template>
  <el-container class="layout">

    <!-- ============ 顶栏 ============ -->
    <el-header class="header">
      <!-- 移动端汉堡按钮（仅窄屏显示） -->
      <el-button
        v-if="isMobile"
        class="hamburger"
        :icon="drawerOpen ? Close : MenuIcon"
        circle
        @click="drawerOpen = !drawerOpen"
      />

      <div class="logo-area" :class="{ 'logo-mobile': isMobile }">
        <el-icon :size="26" class="logo-icon">
          <Tickets />
        </el-icon>
        <span class="logo-text">OA工单管理系统</span>
      </div>

      <!-- PC 横向菜单（仅宽屏显示） -->
      <div v-if="!isMobile" class="nav-area">
        <el-menu :default-active="activeMenu" mode="horizontal" router ellipsis class="top-menu">
          <el-menu-item v-for="nav in visibleNavs" :key="nav.index" :index="nav.index">
            {{ nav.title }}
          </el-menu-item>
        </el-menu>
      </div>

      <div class="header-right">
        <el-dropdown placement="top-end" @command="(cmd) => cmd === 'logout' && handleLogout()">
          <span class="user-info">
            <el-icon :size="16">
              <UserFilled />
            </el-icon>
            <span class="username" v-if="!isMobile">{{ auth.userName }}</span>
            <el-icon v-if="!isMobile" :size="12">
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

    <!-- ============ 移动端抽屉 ============ -->
    <el-drawer
      v-if="isMobile"
      v-model="drawerOpen"
      direction="ltr"
      :size="260"
      :with-header="false"
      class="mobile-drawer"
    >
      <template #default>
        <div class="drawer-header">
          <el-icon :size="20" class="logo-icon">
            <Tickets />
          </el-icon>
          <span class="drawer-title">OA工单管理系统</span>
        </div>
        <el-menu class="drawer-menu" :default-active="activeMenu" router>
          <el-menu-item
            v-for="nav in visibleNavs"
            :key="nav.index"
            :index="nav.index"
            @click="onMobileNavClick(nav)"
          >
            <el-icon v-if="nav.icon"><component :is="nav.icon" /></el-icon>
            <template #title>{{ nav.title }}</template>
          </el-menu-item>
        </el-menu>
        <div class="drawer-footer">
          <el-button type="danger" plain :icon="SwitchButton" @click="handleLogout">
            退出登录
          </el-button>
        </div>
      </template>
    </el-drawer>

    <!-- ============ 内容区 ============ -->
    <el-main class="main">
      <div class="header-left">
        <span class="page-title" v-if="route.meta.title !== '工作台'">{{ route.meta.title || '' }}</span>
      </div>
      <router-view />
    </el-main>
  </el-container>
</template>

<style scoped>
/* ==================== 整体布局 ==================== */
.layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ==================== 顶栏 ==================== */
.header {
  height: 60px;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 20px;
  background: #fff;
  border-bottom: 1px solid #e6eef7;
  box-shadow: 0 1px 4px rgba(20, 72, 126, 0.05);
  flex-shrink: 0;
}

/* --- 汉堡按钮 --- */
.hamburger {
  flex-shrink: 0;
}

/* --- logo 区 --- */
.logo-area {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}
.logo-area.logo-mobile {
  margin-right: auto;
}
.logo-icon {
  flex-shrink: 0;
  color: #8ec9ff;
}
.logo-text {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 1px;
  color: rgb(27, 27, 27);
}

/* --- 中间导航区 --- */
.nav-area {
  flex: 1;
  min-width: 0;
}
.top-menu {
  border-bottom: none;
  background: transparent;
}

/* --- 右侧用户区 --- */
.header-right {
  margin-left: auto;
  flex-shrink: 0;
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

/* ==================== 内容区 ==================== */
.main {
  background: #f0f5fb;
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.page-title {
  font-size: 16px;
  font-weight: 600;
  color: #14487e;
}

/* ==================== 移动端抽屉 ==================== */
.drawer-header {
  padding: 20px 16px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: linear-gradient(120deg, #1e88e5 0%, #42a5f5 100%);
  color: #fff;
}
.drawer-header .logo-icon {
  color: #fff;
}
.drawer-title {
  font-size: 16px;
  font-weight: 600;
}
.drawer-menu {
  border-right: none;
}
.drawer-menu .el-menu-item {
  height: 48px;
  line-height: 48px;
  font-size: 15px;
}
.drawer-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  border-top: 1px solid #ebeef5;
}

/* ==================== 移动端断点 ==================== */
@media (max-width: 768px) {
  .header {
    height: 52px;
    gap: 10px;
    padding: 0 12px;
  }
  .logo-text {
    font-size: 15px;
    letter-spacing: 0;
  }
  .main {
    padding: 12px;
  }
  .page-title {
    font-size: 15px;
  }
}
</style>

<!-- 无 scoped：el-dialog / el-message-box 强制居中 -->
<style>
.el-message-box,
.el-dialog {
  position: fixed !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  margin: 0 !important;
}
.el-overlay-message-box,
.el-overlay-dialog {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
}
</style>
