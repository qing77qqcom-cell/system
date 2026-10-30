<template>
   <div class="header-left">
          <el-icon class="collapse-btn" :size="18" @click="collapsed = !collapsed">
            <Fold v-if="!collapsed" />
            <Expand v-else />
          </el-icon>
          <span class="page-title">{{ route.meta.title || '工作台' }}</span>
        </div>
</template>
<style scoped>
/* 内容区顶部小条：折叠按钮 + 页面标题 */
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
</style>
