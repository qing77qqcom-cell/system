<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Tickets, ArrowDown, SwitchButton, UserFilled } from '@element-plus/icons-vue'
import { currentUser, currentUserInfo } from '@/utils/helpers'

const route = useRoute()
const router = useRouter()

const navs = [
  { index: '/workbench', title: '工作台', roles: null },
  { index: '/work-orders', title: '工单列表', roles: null },
  { index: '/systemcontrol', title: '系统设置', roles: ['部长', '超级管理员'] },
]

// 顶部导航按角色过滤（普通员工看不到系统设置）
const visibleNavs = computed(() =>
  navs.filter((n) => !n.roles || n.roles.includes(currentUserInfo()?.role)),
)

// 详情页归并到所属列表菜单高亮（/work-orders/* → 工单列表，/usercontrol/* → 系统设置）
const activeMenu = computed(() => {
  if (route.path.startsWith('/work-orders')) return '/work-orders'
  if (route.path.startsWith('/usercontrol')) return '/systemcontrol'
  return route.path
})

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
