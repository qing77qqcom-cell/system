<template>
  <div>
    <h1>{{ title }}</h1>
  </div>
</template>

<script setup>
// 模板直接用 prop，不需要本地 ref + watch（watch 没加 immediate，初始值会是空串）
defineProps({
  title: {
    type: String,
    default: '角色权限',
  },
})
</script>
