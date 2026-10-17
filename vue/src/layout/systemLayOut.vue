<template>
  <div class="list-layout">
    <Aside :visibleMenus="visibleMenus" class="sub-aside" />
    <div class="list-content">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { List } from '@element-plus/icons-vue'
import Aside from '@/component/aside.vue'

// 系统设置二级菜单：每项对应一个子路由，内容区由 <router-view> 渲染
const visibleMenus = [
  { title: '组织架构', index: '/systemcontrol/deptcontrol', icon: List },
  { title: '角色权限', index: '/systemcontrol/rolecontrol', icon: List },
  { title: '用户管理', index: '/systemcontrol/usercontrol', icon: List },
  { title: '用户操作日志', index: '/systemcontrol/userlogcontrol', icon: List },
]
</script>

<style scoped>
.list-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  height: 100%;
}

.sub-aside {
  width: 180px;
  flex-shrink: 0;
  background: #fff;
  border-radius: 8px;
  padding: 8px 0;
}

.list-content {
  flex: 1;
  /* flex 子项默认 min-width:auto，列表内容宽时会撑破布局，必须允许收缩 */
  min-width: 0;
}
</style>
