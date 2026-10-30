<script setup>
// 系统设置壳：横向二级菜单 + AsideBar(二级/三级) + router-view
// 全部布局逻辑由 MenuLayout.vue 提供，这里只声明 topIndex
import MenuLayout from '@/components/layout/MenuLayout.vue'
</script>

<template>
  <MenuLayout top-index="/systemcontrol" />
</template>
