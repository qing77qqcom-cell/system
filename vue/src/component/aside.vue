<template>
  <!-- 二级菜单外壳：el-menu-item 必须包在 el-menu 里（内部靠 inject 拿菜单上下文），router 模式按 index 跳转 -->
  <el-menu :default-active="$route.fullPath" router class="sub-menu">
    <el-menu-item v-for="menu in visibleMenus" :key="menu.index" :index="menu.index">
      <el-icon>
        <component :is="menu.icon" />
      </el-icon>
      <template #title>{{ menu.title }}</template>
    </el-menu-item>
  </el-menu>


</template>



<script setup>
// 高亮用 $route.fullPath（含 query），这样 ?status=xxx 的项能精确对应
defineProps({
  visibleMenus: {
    type: Array,
    default: () => [],
  },
})
</script>

<style scoped>
.sub-menu {
  border-right: none;
  background: transparent;
}
</style>
