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

import { ref, watch, computed } from 'vue'
import { useRoute } from 'vue-router'




const route = useRoute()



// 二级菜单：query 参数驱动列表筛选（WorkOrderList 会从 URL 恢复条件并监听变化）
// 注意：指标与 orders.status 真实状态一一对应，不放"逾期"这类非状态指标
const Menus = {
  list:[
  { title: '已提交', index: '/work-orders', icon: List },
  { title: '待处理', index: '/work-orders?status=待处理', icon: List },
  { title: '处理中', index: '/work-orders?status=处理中', icon: List },
  { title: '已完成', index: '/work-orders?status=已完成', icon: List },
  { title: '已关闭', index: '/work-orders?status=已关闭', icon: List },
   { title: '已退回', index: '/work-orders?status=已退回', icon: List },
],
system:[
   { title: '用户管理', index: '/systemcontrol', icon: List },
     { title: '角色权限', index: '/systemcontrol/rolecontrol', icon: List },
   { title: '组织架构', index: '/systemcontrol/deptcontrol', icon: List },

  { title: '用户操作日志', index: '/systemcontrol/userlogcontrol', icon: List },
]
}


const title = ref('已提交')

watch(() => route.query.status, (newStatus) => {
  title.value = newStatus || '已提交'
}, { immediate: true })

const visibleMenus = computed(() => {
  return Menus[route.meta.menuKey] ?? []
})
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
