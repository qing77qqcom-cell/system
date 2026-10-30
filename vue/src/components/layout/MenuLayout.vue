<script setup>
/**
 * 通用壳组件：横向二级菜单 + AsideBar(二级+三级) + router-view
 *
 * 用法1（工作台 · 带问候卡）：
 *   <MenuLayout top-index="/workbench">
 *     <template #header><div class="hello-card">...</div></template>
 *   </MenuLayout>
 *
 * 用法2（系统设置 · 纯净）：
 *   <MenuLayout top-index="/systemcontrol" />
 *
 * 用法3（只留 AsideBar · 隐藏横向）：
 *   <MenuLayout top-index="/team-manage" :show-top-menu="false" />
 *
 * 联动原理：
 *   横向 el-menu 和 AsideBar 共用同一个 secondMenus 数组（从 menu-config.js 按 topIndex 取），
 *   都用 router 模式，点击任何一项都走 router.push → 两边的 default-active / default-openeds 自动同步。
 *
 * Props:
 *   topIndex   {String}  一级菜单 index，如 '/workbench'、'/systemcontrol'、'/approval-center'
 *                       内部会调 getSubTree(auth.role, topIndex)?.children 拿二级菜单数组
 *   showTopMenu {Boolean} 是否显示顶部横向二级菜单（默认 true）
 *
 * Slots:
 *   header  可选，放在横向菜单上方（Workbench 放问候卡，其他页面可空）
 *
 * router-view:
 *   该组件设计为路由的 component 或 Layout 的子组件，内部 router-view 渲染当前路由的 children。
 *   例如：/workbench → MenuLayout(Workbench.vue 替代) → 渲染 children todo/datalist/workorderlist
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
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

/**
 * 二级菜单完整数组（横向菜单条和 AsideBar 共用 → 数据源唯一保证联动一致）
 * 每项结构：{ index, title, icon?, children? }
 *   - 有 children → AsideBar 里是 el-sub-menu（标题=二级，展开后=三级叶子）
 *   - 无 children → AsideBar 里是 el-menu-item（叶子，直接 router 跳转）
 */
const secondMenus = computed(() => getSubTree(auth.role, props.topIndex)?.children || [])

/**
 * 当前激活的二级菜单 index：按路由 path 前缀匹配
 * /workbench/todo?tab=notice → 匹配到 { index: '/workbench/todo', title: '通知待办' }
 * 这个值驱动横向菜单条高亮；AsideBar 内部自己算 activeIndex / openedKeys
 */
const activeSecondIndex = computed(() => {
  const p = route.path
  const hit = secondMenus.value.find((m) => p.startsWith(m.index.split('?')[0]))
  return hit ? hit.index : secondMenus.value[0]?.index || ''
})

/**
 * 是否显示 AsideBar：只有当二级菜单数组非空时才显示
 * 空数组说明当前角色没有这个 topIndex 的菜单（不会发生，但防御一下）
 */
const showAside = computed(() => secondMenus.value.length > 0)
</script>

<template>
  <div class="menu-layout">
    <!-- 顶部 slot（Workbench 放问候卡，其他页面可空） -->
    <div v-if="$slots.header" class="ml-header">
      <slot name="header" />
    </div>

    <!-- 横向二级菜单条 -->
    <el-menu
      v-if="showTopMenu && showAside"
      :default-active="activeSecondIndex"
      mode="horizontal"
      router
      class="ml-top-menu"
    >
      <el-menu-item v-for="m in secondMenus" :key="m.index" :index="m.index">
        <el-icon v-if="m.icon"><component :is="m.icon" /></el-icon>
        {{ m.title }}
      </el-menu-item>
    </el-menu>

    <!-- 主体：AsideBar(二级+三级完整树) + router-view -->
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
  /* 给 router-view 子页面一个确定的最小高度，内部 LogicFlow 画布需要 */
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
  min-height: 620px;  /* 关键：给子页面一个确定高度 */
}
</style>
