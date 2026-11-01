<script setup>
/**
 * 通用壳组件：横向二级菜单 + AsideBar(二级/三级) + router-view
 *
 * 关键设计（为了"虚拟分组 → 真实叶子"联动）：
 *
 *   路由结构：/workbench/todo    ← 直接就是二级菜单的 index
 *             /systemcontrol     ← 路由是叶子，但菜单里它在"组织与权限管理"组下面
 *
 *   工作台联动：secondMenus[i].index === 真实路由 → el-menu router 模式直接用 ✅
 *   系统设置联动：secondMenus[i].index === 虚拟分组（路由里不存在）
 *     → 横向菜单用虚拟 index 渲染，但 @select 时翻译成组内第一个真实叶子路径
 *     → 这样：点击组 → router.push(叶子路径) → 导航 + 横向 + 竖同时联动
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/store.js'
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

// ———————— 数据源 ————————

/** AsideBar 用的完整菜单树（保留 children 嵌套） */
const secondMenus = computed(() => getSubTree(auth.role, props.topIndex)?.children || [])

/** 递归找"第一个叶子"（没有 children 的节点 = 真实路由） */
function findFirstLeafIndex(item) {
  if (!item.children?.length) return item.index || ''
  for (const c of item.children) {
    const r = findFirstLeafIndex(c)
    if (r) return r
  }
  return ''
}

/**
 * 虚拟分组 index → 真实叶子 index 的映射表
 *   '/systemcontrol/org-perm'  → '/systemcontrol'
 *   '/systemcontrol/flow-rule' → '/systemcontrol/approval-flow?tab=list'
 * 横向菜单渲染时用虚拟 index（组名），@select 时 translate 成真实路径再 push
 */
const groupToLeafMap = computed(() => {
  const map = {}
  for (const m of secondMenus.value) {
    map[m.index] = findFirstLeafIndex(m) || m.index
  }
  return map
})

/**
 * 路由 path → 虚拟分组 index 的反向映射
 *   当前路由 '/systemcontrol/rolecontrol' → 属于虚拟组 '/systemcontrol/org-perm'
 * 用来算 activeSecondIndex（横向菜单哪个组应该高亮）
 */
function findGroupIndexByPath(path) {
  for (const m of secondMenus.value) {
    // 组内任意叶子能匹配 path → 这个组就是 active 的
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

// ———————— 横向菜单状态 ————————

/** el-menu :default-active —— 虚拟组 index（不是真实叶子） */
const activeSecondIndex = computed(() => findGroupIndexByPath(route.path))

/** el-menu @select handler —— 虚拟组 index → translate → router.push(真实叶子) */
function onHorizontalSelect(groupIndex) {
  const target = groupToLeafMap.value[groupIndex] || groupIndex
  if (!target) return
  if (target !== route.fullPath) {
    router.push(target)
  }
}

// ———————— AsideBar 可见性 ————————
const showAside = computed(() => secondMenus.value.length > 0)
</script>

<template>
  <div class="menu-layout">
    <!-- 顶部 slot（Workbench 放问候卡，其他页面可空） -->
    <div v-if="$slots.header" class="ml-header">
      <slot name="header" />
    </div>

    <!--
      横向二级菜单条：
      · :index = 虚拟组 index（用来关联 activeSecondIndex 和 AsideBar 展开逻辑）
      · router = false（关！因为虚拟 index 不是真实路由，push 会 404）
      · @select = 手动 translate 成真实叶子再 push
    -->
    <el-menu
      v-if="showTopMenu && showAside"
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

    <!-- 主体 -->
    <div class="ml-body">
      <aside v-if="showAside" class="ml-aside">
        <AsideBar :menus="secondMenus" />
      </aside>
      <main class="ml-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.ml-header {
  margin-bottom: 12px;
}

.ml-top-menu {
  background: #fff;
  border-bottom: 1px solid #e6eef7;
  border-radius: 8px;
  margin-bottom: 16px;
}

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
</style>
