<script setup>
/**
 * 通用壳组件：横向二级菜单 + AsideBar(二级/三级) + router-view
 *
 * 移动端适配：
 *   - 横向二级菜单 → overflow-x:auto 可横滑（不换行）
 *   - AsideBar(侧边栏) → 汉堡按钮 + el-drawer 抽屉（280px）
 *   - 内容区 → 全宽、padding 收窄
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Menu as MenuIcon } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/store.js'
import { useMobile } from '@/composables/useMobile.js'
import AsideBar from '@/components/AsideBar.vue'
import { getSubTree } from '@/schema/menu-config'

const props = defineProps({
  topIndex: {
    type: String,
    required: true,
    validator: (v) => v.startsWith('/'),
  },
  showTopMenu: {
    type: Boolean,
    default: true,
  },
})

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { isMobile } = useMobile()

// ———————— 数据源（和之前一模一样）————————
const secondMenus = computed(() => getSubTree(auth.role, props.topIndex)?.children || [])

function findFirstLeafIndex(item) {
  if (!item.children?.length) return item.index || ''
  for (const c of item.children) {
    const r = findFirstLeafIndex(c)
    if (r) return r
  }
  return ''
}

const groupToLeafMap = computed(() => {
  const map = {}
  for (const m of secondMenus.value) {
    map[m.index] = findFirstLeafIndex(m) || m.index
  }
  return map
})

/**
 * 兜底算法：path → 二级菜单组 index（最长精确匹配）
 * 用于：直接输入 URL 进入、横向 el-menu 点击跳转等 AsideBar 未触发的场景
 *
 * 优先用 AsideBar @menu-click 传来的 groupIndex（直接、不反推、最准确）
 * 只有拿不到 AsideBar 事件时才走这里
 */
function findGroupIndexByPath(path) {
  let bestGroup = null
  let bestMatchLen = 0

  for (const m of secondMenus.value) {
    const matchLen = findBestMatchLen(m, path)
    if (matchLen > bestMatchLen) {
      bestMatchLen = matchLen
      bestGroup = m
    }
  }
  return bestGroup?.index || secondMenus.value[0]?.index || ''
}
/** 递归找 item 子树中与 targetPath 精确匹配的最长叶子路径长度；无匹配返回 0 */
function findBestMatchLen(item, targetPath) {
  if (!item.children?.length) {
    const itemPath = item.index.split('?')[0]
    const targetOnly = targetPath.split('?')[0]
    if (itemPath === targetOnly || item.index === targetPath) {
      return itemPath.length
    }
    return 0
  }
  let maxLen = 0
  for (const c of item.children) {
    maxLen = Math.max(maxLen, findBestMatchLen(c, targetPath))
  }
  return maxLen
}

/**
 * 当前激活的二级菜单组 index（横向 el-menu 高亮用）
 * 双通道更新：
 *   1. AsideBar @menu-click → payload.groupIndex（直接来源，最准确）
 *   2. watch route.fullPath → 兜底（地址栏输入、横向菜单自身点击跳转）
 */
const activeSecondIndex = ref(findGroupIndexByPath(route.path))
// 路由变化兜底更新（AsideBar 事件已覆盖大部分场景，这里处理直接输 URL 等情况）
watch(() => route.fullPath, () => {
  activeSecondIndex.value = findGroupIndexByPath(route.path)
}, { immediate: true })

function onHorizontalSelect(groupIndex) {
  const target = groupToLeafMap.value[groupIndex] || groupIndex
  if (!target) return
  if (target !== route.fullPath) {
    router.push(target)
    mobileAsideOpen.value = false
  }
}

/**
 * AsideBar 点击任意层级叶子菜单项 → 子传父事件
 * 路由跳转后的二级菜单高亮靠 watch route.fullPath 兜底自动联动，
 * 这里留空；如果将来需要埋点/日志可以加在这里
 */
function onAsideMenuClick(_path) {
  // 预留：将来可加埋点、统计等副作用
}

const showAside = computed(() => secondMenus.value.length > 0)

// ———————— 移动端 AsideBar 抽屉状态 ————————
const mobileAsideOpen = ref(false)
watch(() => route.fullPath, () => { mobileAsideOpen.value = false })
watch(isMobile, (v) => { if (!v) mobileAsideOpen.value = false })
</script>

<template>
  <div class="menu-layout">
    <!-- 顶部 slot -->
    <div v-if="$slots.header" class="ml-header">
      <slot name="header" />
    </div>

    <!-- ============ 横向二级菜单条 ============ -->
    <div v-if="showTopMenu && showAside" class="ml-top-bar">
      <!-- 移动端：汉堡按钮（打开 AsideBar 抽屉） -->
      <el-button
        v-if="isMobile"
        class="ml-aside-toggle"
        :icon="MenuIcon"
        circle
        size="small"
        @click="mobileAsideOpen = !mobileAsideOpen"
      />

      <!-- 横向二级菜单（宽屏 inline，窄屏可横滑） -->
      <div class="ml-top-menu-wrap">
        <el-menu
          :default-active="activeSecondIndex"
          mode="horizontal"
          @select="onHorizontalSelect"
          class="ml-top-menu"
        >
          <el-menu-item
            v-for="m in secondMenus"
            :key="m.index"
            :index="m.index"
          >
            <el-icon v-if="m.icon"><component :is="m.icon" /></el-icon>
            {{ m.title }}
          </el-menu-item>
        </el-menu>
      </div>
    </div>

    <!-- ============ 主体 ============ -->
    <div class="ml-body">
      <!-- PC 侧边栏（固定 220px 宽） -->
      <aside v-if="showAside && !isMobile" class="ml-aside">
        <AsideBar :menus="secondMenus" @menu-click="onAsideMenuClick" />
      </aside>

      <!-- 移动端侧边栏抽屉 -->
      <el-drawer
        v-if="showAside && isMobile"
        v-model="mobileAsideOpen"
        direction="ltr"
        :size="280"
        :with-header="false"
        append-to-body
      >
        <div class="mobile-aside-wrap">
          <AsideBar :menus="secondMenus" @menu-click="onAsideMenuClick" />
        </div>
      </el-drawer>

      <!-- 内容区 -->
      <main class="ml-content" :class="{ 'ml-content-full': !showAside }">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.ml-header {
  margin-bottom: 12px;
}

/* ============ 顶部横向二级菜单条 ============ */
.ml-top-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border-bottom: 1px solid #e6eef7;
  border-radius: 8px;
  margin-bottom: 16px;
  overflow: hidden;
}

.ml-top-menu-wrap {
  flex: 1;
  min-width: 0;
}

.ml-top-menu {
  background: transparent;
  border-bottom: none;
}

/* ============ 主体 ============ */
.ml-body {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  min-height: 620px;
}

.ml-aside {
  width: 220px;
  flex-shrink: 0;
  background: #fff;
  border-radius: 8px;
  padding: 8px 0;
  border: 1px solid #e6eef7;
}

.ml-content {
  flex: 1;
  min-width: 0;
  min-height: 620px;
}
.ml-content-full {
  width: 100%;
}

/* 移动端抽屉里的 AsideBar 容器 */
.mobile-aside-wrap {
  padding: 12px 8px;
}

/* ==================== 移动端断点 ==================== */
@media (max-width: 768px) {
  .ml-header {
    margin-bottom: 8px;
  }

  .ml-top-bar {
    border-radius: 6px;
    margin-bottom: 12px;
    /* 窄屏允许横向菜单横滑 */
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
  }
  .ml-top-menu-wrap {
    /* 让菜单内容保持不换行，overflow 由父级滚动 */
    overflow: visible;
  }
  .ml-top-menu {
    white-space: nowrap;
    /* 取消 el-menu 默认的 ellipsis 折叠，让所有项都显示在一行可横滑 */
  }
  .ml-top-menu :deep(.el-menu-item) {
    flex: none;
  }

  .ml-aside-toggle {
    margin-left: 6px;
    flex-shrink: 0;
  }

  .ml-body {
    /* 移动端没有 AsideBar，内容区全宽 */
    gap: 0;
    min-height: auto;
  }
  .ml-aside {
    display: none;
  }
  .ml-content {
    min-height: auto;
    width: 100%;
  }
}
</style>
