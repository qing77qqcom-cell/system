<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Tickets, ArrowDown, SwitchButton, UserFilled } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/store.js'
import { logout as apiLogout } from '@/api/user'
import { getTopMenus } from '@/schema/menu-config'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

/**
 * 一级菜单：从 menu-config.js 的 getTopMenus() 统一取
 * 个人中心的 index 带当前用户 id，运行时动态拼（见 visibleNavs）
 */
const visibleNavs = computed(() => {
  const role = auth.role
  const base = getTopMenus(role)
  // 部长/员工末尾追加个人中心
  if ((role === '技术部部长' || role === '技术部普通员工') && auth.user?.id) {
    return [...base, { index: `/usercontrol/${auth.user.id}`, title: '个人中心' }]
  }
  return base
})

// 当前菜单高亮：路径归并到所属一级菜单
// /work-orders/create → 员工有，归并到它；其他 /work-orders/* 部长超管菜单里没工单项 → 归并到工作台
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
    .catch(() => { /* 用户点取消，啥也不做 */ })
}
</script>

<template>
  <el-container class="layout">

           <!-- 顶栏 -->
       <el-header class="header">
        <div class="logo-area">
        <el-icon :size="26" class="logo-icon">
          <Tickets />
        </el-icon>
        <span class="logo-text">OA工单管理系统</span>
      </div>
      <div class="nav-area">
        <!-- router 是 el-menu 的属性（写在 menu-item 上无效）：开启后点击项按其 index 跳转；
             ellipsis 让窄屏放不下的项自动收进“更多”子菜单 -->
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
              <span class="username">{{ auth.userName }}</span>
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
}

/* ==================== 内容区 ==================== */
.main {
  background: #f0f5fb;
  padding: 16px;
  overflow-y: auto;
}

/* 内容区顶部小条：页面标题 */
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

/* ==================== 顶栏 ==================== */
/* 整体：弹性三段式 —— logo 定宽内容 / 导航占据剩余空间 / 用户区 auto margin 推到最右 */
.header {
  height: 60px;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 20px;
  background: #fff;
  border-bottom: 1px solid #e6eef7;
  box-shadow: 0 1px 4px rgba(20, 72, 126, 0.05);
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

/* --- 中间导航区：flex:1 吃掉剩余空间 --- */
.nav-area {
  flex: 1;
  /* el-menu horizontal 不换行，min-width:auto 会按内容宽度拒绝收缩，
     必须显式允许压缩，否则窄屏会把整个 header 撑爆 */
  min-width: 0;
}

/* 顶部菜单去掉默认底边框，与 header 自己的下边框统一 */
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

/* --- 移动端适配：收窄间距、隐藏 logo 文字；导航保留，溢出项由 el-menu ellipsis 收纳 --- */
@media (max-width: 768px) {
  .header {
    gap: 12px;
    padding: 0 12px;
  }

  .logo-text {
    display: none;
  }
}
</style>

<!--
  无 scoped：ElMessageBox / ElDialog 等 overlay 组件 teleport 到 body，
  scoped 样式隔离后管不到。
  强制居中：给 message-box / dialog 本体上 position:fixed + 自己算 50% 居中，
  完全不依赖 overlay 的 flex / height 检测。
-->
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
