<script setup></script>

<template>
  <router-view />
  <!-- route组件渲染出口 -->
</template>

<style>
:root {
  /* 全局统一企业蓝主题色 */
  --el-color-primary: #1e88e5;
}

* {
  box-sizing: border-box;
}

html,
body,
#app {
  margin: 0;
  padding: 0;
  height: 100%;
}

body {
  font-family:
    'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', Arial, sans-serif;
}
</style>
