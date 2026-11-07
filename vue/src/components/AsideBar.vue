<template>
  <!--
    通用二级/三级/四级菜单组件
    联动原理：
      - 横向菜单（MenuLayout）点二级组 → router.push(组内第一个叶子) → AsideBar 根据 route.path 自动高亮 + 展开
      - AsideBar 点叶子 → router.push → 横向菜单 activeSecondIndex 自动更新

    关键实现：用 ref 手动 open/close sub-menu，不能靠 default-openeds（只初始化一次）
  -->
  <el-menu
    ref="menuRef"
    router
    class="aside-bar"
  >
    <!-- ===== 二级菜单数组 ===== -->
    <template v-for="item in menus" :key="item.index">
      <!-- 叶子二级（本身就是路由，无子菜单） -->
      <el-menu-item v-if="!item.children?.length" :index="item.index">
        <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>
        <template #title>{{ item.title }}</template>
      </el-menu-item>

      <!-- 可展开二级 → 内嵌三级 -->
      <el-sub-menu v-else :index="item.index">
        <template #title>
          <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>
          <span>{{ item.title }}</span>
        </template>

        <!-- ===== 三级 ===== -->
        <template v-for="child in item.children" :key="child.index">
          <!-- 叶子三级 -->
          <el-menu-item v-if="!child.children?.length" :index="child.index">
            <el-icon v-if="child.icon"><component :is="child.icon" /></el-icon>
            <template #title>{{ child.title }}</template>
          </el-menu-item>

          <!-- 可展开三级 → 内嵌四级叶子 -->
          <el-sub-menu v-else :index="child.index">
            <template #title>
              <el-icon v-if="child.icon"><component :is="child.icon" /></el-icon>
              <span>{{ child.title }}</span>
            </template>
            <el-menu-item
              v-for="grand in child.children"
              :key="grand.index"
              :index="grand.index"
            >
              <el-icon v-if="grand.icon"><component :is="grand.icon" /></el-icon>
              <template #title>{{ grand.title }}</template>
            </el-menu-item>
          </el-sub-menu>
        </template>
      </el-sub-menu>
    </template>
  </el-menu>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps({
  /** 二级菜单数组 */
  menus: { type: Array, default: () => [] },
})

const route = useRoute()
const menuRef = ref(null)

/** 激活的菜单项（精确匹配 fullPath → 降级 path 前缀匹配） */
const activeIndex = computed(() => {
  const full = route.fullPath
  const pathOnly = route.path
  function findInLeaves(items) {
    for (const it of items) {
      if (!it.children?.length) {
        if (it.index === full) return it.index
        const itPath = it.index.split('?')[0]
        if (pathOnly.startsWith(itPath) || itPath.startsWith(pathOnly)) return it.index
      } else {
        const r = findInLeaves(it.children)
        if (r) return r
      }
    }
    return ''
  }
  return findInLeaves(props.menus)
})

/** 当前路由所属的所有父级 sub-menu index（从最近到最远） */
const parentSubMenus = computed(() => {
  const p = route.path
  const result = []
  function walk(items) {
    for (const item of items) {
      if (!item.children?.length) continue
      const hasMatch = hasMatchingLeaf(item.children, p)
      if (hasMatch) {
        result.push(item.index)
        walk(item.children) // 嵌套父级继续找
      }
    }
  }
  walk(props.menus)
  return result
})
function hasMatchingLeaf(items, targetPath) {
  for (const it of items) {
    if (!it.children?.length) {
      const itPath = it.index.split('?')[0]
      if (targetPath.startsWith(itPath) || itPath.startsWith(targetPath)) return true
    } else {
      if (hasMatchingLeaf(it.children, targetPath)) return true
    }
  }
  return false
}

/** 当 activeIndex 变化时，手动高亮对应的菜单项（default-active 只初始化一次） */
watch(activeIndex, async (idx) => {
  await nextTick()
  if (menuRef.value) menuRef.value.active = idx || ''
}, { immediate: true })

/** 当路由变化时，手动展开所需 sub-menu */
watch(parentSubMenus, async (keys) => {
  await nextTick()
  if (!menuRef.value) return
  // 先全部关闭
  const allSubIndices = collectAllSubMenuIndices(props.menus)
  allSubIndices.forEach((idx) => menuRef.value.close(idx))
  // 只展开匹配的（从外到内）
  keys.forEach((idx) => menuRef.value.open(idx))
}, { immediate: true })

function collectAllSubMenuIndices(items, result = []) {
  for (const it of items) {
    if (it.children?.length) {
      result.push(it.index)
      collectAllSubMenuIndices(it.children, result)
    }
  }
  return result
}
</script>

<style scoped>
.aside-bar {
  border-right: none;
  background: transparent;
}

.aside-bar .el-menu-item,
.aside-bar .el-sub-menu__title {
  gap: 8px;
}

/* 三级/四级叶子高亮 */
.aside-bar :deep(.el-menu-item.is-active) {
  background: #eaf4fe;
  color: #1e88e5;
  border-right: 2px solid #1e88e5;
}

/* 激活的二级菜单标题也高亮，强化和横向二级的联动感 */
.aside-bar :deep(.el-sub-menu.is-active > .el-sub-menu__title) {
  color: #1e88e5;
  font-weight: 600;
}
</style>
