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

function findGroupIndexByPath(path) {
  for (const m of secondMenus.value) {
    if (findMatchingLeaf(m, path)) return m.index
  }
  return secondMenus.value[0]?.index || ''
}
function findMatchingLeaf(item, targetPath) {
  if (!item.children?.length) {
    const itemPath = item.index.split('?')[0]
    return targetPath.startsWith(itemPath) || itemPath.startsWith(targetPath)
  }
  for (const c of item.children) {
    if (findMatchingLeaf(c, targetPath)) return true
  }
  return false
}

const activeSecondIndex = computed(() => findGroupIndexByPath(route.path))

function onHorizontalSelect(groupIndex) {
  const target = groupToLeafMap.value[groupIndex] || groupIndex
  if (!target) return
  if (target !== route.fullPath) {
    router.push(target)
    mobileAsideOpen.value = false
  }
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
        <AsideBar :menus="secondMenus" />
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
          <AsideBar :menus="secondMenus" />
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
