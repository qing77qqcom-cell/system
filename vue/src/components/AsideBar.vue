<template>
  <!--
    通用二级/三级菜单组件
    用法1（工作台）：<AsideBar :menus="secondMenus" />
   用法2（系统设置）：<AsideBar :menus="getSubTree(role,'/systemcontrol')?.children" />

    联动原理：和父组件（如 Workbench.vue 的横向 el-menu）共用同一个 menus 数组 + router 模式
              点 AsideBar 的菜单项 → router.push → 横向菜单的 default-active 自动更新
              点横向菜单的菜单项 → router.push → AsideBar 的 activeIndex / openedKeys 自动更新

    渲染规则：
      - 无 children → el-menu-item（叶子，router 跳转）
      - 有 children → el-sub-menu（标题是二级，展开后内部是三级 el-menu-item）
                      三级如果还有 children → 继续 el-sub-menu 嵌套（当前最深到四级）

    高亮/展开：
      - activeIndex: 精确匹配 fullPath，降级 path 前缀匹配
      - openedKeys: 只展开「当前路由所属」的那个二级菜单（以及嵌套父级）
  -->
  <el-menu
    :default-active="activeIndex"
    :default-openeds="openedKeys"
    router
    class="aside-bar"
  >
    <!-- ===== 二级菜单（AsideBar 收到的数组就是二级） ===== -->
    <template v-for="item in menus" :key="item.index">
      <!-- 叶子二级（本身就是路由，无子菜单） -->
      <el-menu-item v-if="!item.children?.length" :index="item.index">
        <el-icon v-if="item.icon">
          <component :is="item.icon" />
        </el-icon>
        <template #title>{{ item.title }}</template>
      </el-menu-item>

      <!-- 可展开二级 → 标题显示二级名，展开后内嵌三级 -->
      <el-sub-menu v-else :index="item.index">
        <template #title>
          <el-icon v-if="item.icon">
            <component :is="item.icon" />
          </el-icon>
          <span>{{ item.title }}</span>
        </template>

        <!-- ===== 三级 ===== -->
        <template v-for="child in item.children" :key="child.index">
          <!-- 叶子三级 -->
          <el-menu-item v-if="!child.children?.length" :index="child.index">
            <el-icon v-if="child.icon">
              <component :is="child.icon" />
            </el-icon>
            <template #title>{{ child.title }}</template>
          </el-menu-item>

          <!-- 可展开三级 → 内嵌四级叶子 -->
          <el-sub-menu v-else :index="child.index">
            <template #title>
              <el-icon v-if="child.icon">
                <component :is="child.icon" />
              </el-icon>
              <span>{{ child.title }}</span>
            </template>
            <el-menu-item
              v-for="grand in child.children"
              :key="grand.index"
              :index="grand.index"
            >
              <el-icon v-if="grand.icon">
                <component :is="grand.icon" />
              </el-icon>
              <template #title>{{ grand.title }}</template>
            </el-menu-item>
          </el-sub-menu>
        </template>
      </el-sub-menu>
    </template>
  </el-menu>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps({
  /** 二级菜单数组（完整数组，不是某个二级的 children） */
  menus: {
    type: Array,
    default: () => [],
  },
})

const route = useRoute()

/**
 * 当前高亮的菜单项 index：
 * 1. 精确匹配 route.fullPath（菜单项 index 带 ?tab=xxx 的三级叶子）
 * 2. 遍历所有叶子找 fullPath 匹配
 * 3. 降级 path 前缀匹配（菜单项不带 query，当前路由带 query）
 */
const activeIndex = computed(() => {
  const full = route.fullPath
  const pathOnly = route.path

  function findInLeaves(items) {
    for (const it of items) {
      if (!it.children?.length) {
        // 叶子节点：先精确 fullPath，再 path 前缀
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

/**
 * 自动展开的 el-sub-menu index 列表：
 * 只展开「当前路由所属」的那个二级菜单（以及嵌套的父级）
 * 这样横向二级菜单高亮哪个，AsideBar 就只展开哪个的三级
 */
const openedKeys = computed(() => {
  const p = route.path
  const result = []

  function walk(items) {
    for (const item of items) {
      if (!item.children?.length) continue

      // 这个子菜单里有没有 path 匹配当前路由的三级/四级项
      const hasMatch = hasMatchingLeaf(item.children, p)
      if (hasMatch) {
        result.push(item.index)
        walk(item.children) // 嵌套场景继续找父级
      }
    }
  }

  walk(props.menus)
  return result
})

/** 递归判断 item.children 里有没有叶子的 path 前缀匹配 targetPath */
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

/* 激活的二级菜单标题也高亮一下，强化和横向二级的联动感 */
.aside-bar :deep(.el-sub-menu.is-active > .el-sub-menu__title) {
  color: #1e88e5;
  font-weight: 600;
}
</style>
