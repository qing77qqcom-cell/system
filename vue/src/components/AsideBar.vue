<template>
  <nav class="aside-bar">
    <ul class="menu-list">
      <li v-for="item in menus" :key="item.index">
        <!-- ========== 叶子节点（本身就是路由，无子菜单） ========== -->
        <!--
          为什么用 <div> 而不是 <a>：
          <a :href="item.index"> 即使有 @click.prevent，Vue Router 的 beforeEach 也可能在原生 href
          触发后先把路由改了 → 此时 go() 里的守卫 path !== route.fullPath 就永远为 false
          → router.push 永远不执行 → 路由不跳转 → watch 不触发 → 二级菜单不高亮
          用 <div> + role="link" + cursor:pointer 彻底避免原生 href 干扰
        -->
        <div
          v-if="!item.children?.length"
          class="menu-item"
          role="link"
          tabindex="0"
          :class="{ active: isActive(item.index) }"
          @click="go(item.index)"
          @keydown.enter.prevent="go(item.index)"
        >
          <span v-if="item.icon" class="icon"><component :is="item.icon" /></span>
          <span class="title">{{ item.title }}</span>
        </div>

        <!-- ========== 可展开节点（用原生 <details> + <summary> 实现折叠） ========== -->
        <details
          v-else
          class="sub-menu"
          :open="expanded.has(item.index)"
          @toggle="(e) => {
            if (e.target.open) expanded.add(item.index)
            else expanded.delete(item.index)
          }"
        >
          <summary
            class="sub-title"
            :class="{ active: hasActiveChild(item) }"
          >
            <span v-if="item.icon" class="icon"><component :is="item.icon" /></span>
            <span class="title">{{ item.title }}</span>
            <span class="arrow" aria-hidden="true"></span>
          </summary>

          <!-- 递归嵌套：同一个组件渲染子节点（支持三级/四级/...） -->
          <AsideBar :menus="item.children" />
        </details>
      </li>
    </ul>
  </nav>
</template>

<script setup>
import { reactive, watch, nextTick, provide, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'

// script setup 里组件要递归引用自己，必须显式声明 name
defineOptions({ name: 'AsideBar' })

const props = defineProps({
  /** 菜单数组（可能是顶层数组，也可能是父级 children） */
  menus: { type: Array, default: () => [] },
})

// —— 子传父：递归层 AsideBar 点击叶子也要能冒泡到顶层 AsideBar 的父组件 ——
// Vue 递归组件 emit 不会自动冒泡，所以顶层 AsideBar 把自己的 emit provide 下去
const emit = defineEmits(['menu-click'])

const ROOT_EMIT_KEY = Symbol('AsideBarRootEmit')
const parentEmit = inject(ROOT_EMIT_KEY, null)

if (!parentEmit) {
  // 顶层 AsideBar：提供自己的 emit 给所有递归子组件共享
  provide(ROOT_EMIT_KEY, emit)
}
// 统一用顶层的 emit（不管是顶层还是递归层 AsideBar）
const fireMenuClick = parentEmit || emit

const route = useRoute()
const router = useRouter()

/** 当前展开的 sub-menu index 集合（reactive Set 才能触发 Vue 响应式） */
const expanded = reactive(new Set())

/**
 * 点击叶子菜单项 → 通知父组件 + 路由跳转
 * 不再用守卫条件，直接 push（Vue Router 内部判断同路径自动跳过）
 * 注意：必须用 <div> + role="link" 而不是 <a>，
 *   因为 <a :href> 的原生跳转可能先于 @click 触发，导致路由已变但守卫跳过 router.push
 */
function go(path) {
  fireMenuClick(path)
  router.push(path)
}

// —— 高亮判断（直接用 route.path 比较，不依赖递归 computed） ——

/**
 * 判断某个叶子菜单项是否该高亮（精确匹配）
 *
 * 判定逻辑：
 *   1. fullPath 精确匹配 —— 最精准，解决 query 不同 tab 同时亮的问题
 *   2. path 精确匹配兜底 —— 仅对【不带 query】的菜单项生效
 *      为什么带 query 的不走 path 兜底？
 *        因为同组 tab 叶子去掉 query 后 path 都相同
 *        （例 sla-config 的 rules/events/calendar 三个叶子 path 都是 /systemcontrol/sla-config）
 *        如果带 query 的也走 path 兜底，当 route.path = /systemcontrol/sla-config 时
 *        三个 tab 会同时命中兜底条件，全部误亮
 *
 * ❌ 为什么不能用 startsWith 前缀匹配？
 *   menu-config 里同级兄弟叶子存在路径前缀重叠（如 /systemcontrol 和 /systemcontrol/deptcontrol），
 *   startsWith 会让短 path 被长 path 路由错误激活，导致"点一个全亮"。
 *   父子层级的高亮已经由 hasActiveChild（sub-title 的 active 类）处理，叶子之间不需要前缀匹配。
 */
function isActive(itemIndex) {
  // 1) fullPath 精确匹配：最精准
  if (route.fullPath === itemIndex) return true

  // 2) path 精确匹配兜底：仅对不带 query 的菜单项生效
  //    带 query 的菜单项（同 path 多 tab）严格走 fullPath，不兜底
  if (!itemIndex.includes('?')) {
    if (route.path === itemIndex) return true
  }
  return false
}

/** 判断某个可展开节点是否包含当前激活的叶子（递归遍历 children） */
function hasActiveChild(item) {
  if (!item.children?.length) return false
  for (const child of item.children) {
    if (isActive(child.index)) return true        // 子节点直接匹配
    if (hasActiveChild(child)) return true         // 子节点的子节点匹配
  }
  return false
}

/** 找出当前路由所属的所有父级 sub-menu index（驱动自动展开） */
function findParents(items, parents = []) {
  for (const it of items) {
    if (!it.children?.length) continue
    if (hasActiveChild(it)) {
      parents.push(it.index)
      findParents(it.children, parents)
    }
  }
  return parents
}

// watch route 变化 → 自动展开当前路由所属的所有父级
watch(
  () => route.path,
  async () => {
    await nextTick()
    expanded.clear()
    // 顶层 AsideBar 的 props.menus 就是完整菜单树，直接遍历
    findParents(props.menus).forEach((idx) => expanded.add(idx))
  },
  { immediate: true }
)
</script>

<style scoped>
/* ========== 整个侧边栏容器 ========== */
.aside-bar {
  width: 200px;                  /* 固定宽度，侧栏常见值 */
  padding: 12px 0;               /* 上下留点呼吸空间 */
  background: #fff;
  border-right: 1px solid #eef2f7;
  font-size: 14px;
  color: #37495c;
}

/* ========== 所有 ul 菜单列表 ========== */
.menu-list {
  list-style: none;              /* 干掉 ul 默认的圆点 */
  margin: 0;
  padding: 0;
}

/* 嵌套的 ul（递归 AsideBar 渲染出来的第二层/第三层菜单）
   用 > li 下的 ul 选择，每嵌套一层多缩进 16px */
.menu-list li > .menu-list {
  padding-left: 16px;
}
/* 再嵌套一层（第四层）再多缩进 16px */
.menu-list li > .menu-list li > .menu-list {
  padding-left: 16px;            /* 上面已经有 16，这里再加 16 = 32px */
}

/* ========== 叶子菜单项（<a> 标签） ========== */
.menu-item {
  display: flex;                 /* 让 icon、title 横向排列 */
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 16px;
  margin: 2px 8px;
  border-radius: 6px;
  color: #5a6c7d;
  text-decoration: none;         /* 干掉 a 标签下划线 */
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.menu-item:hover {
  background: #f3f8fe;            /* hover 变浅蓝 */
  color: #1e88e5;
}
/* 当前激活项：左边画蓝条 + 浅蓝背景 + 蓝色文字 */
.menu-item.active {
  position: relative;
  background: #eaf4fe;
  color: #1e88e5;
  font-weight: 500;
}
/* 左边的竖条指示器：伪元素画一条 2px 蓝条 */
.menu-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 16px;
  border-radius: 0 2px 2px 0;
  background: #1e88e5;
}

/* ========== icon SVG ========== */
.icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;                /* 防止文字多时图标被压缩 */
}
.icon svg {
  width: 18px;
  height: 18px;
}

/* ========== 可展开项（details） ========== */
/* 干掉浏览器默认的 ▾ 三角 marker */
.sub-menu > summary {
  list-style: none;              /* Chrome/Edge */
  cursor: pointer;
  outline: none;                 /* 去掉聚焦时的虚线框 */
}
.sub-menu > summary::-webkit-details-marker {
  display: none;                 /* Safari/旧版 Chrome */
}

/* sub-title 和 menu-item 基本一样，多了个 .arrow 的空间 */
.sub-title {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 16px;
  margin: 2px 8px;
  border-radius: 6px;
  color: #5a6c7d;
  transition: background 0.15s, color 0.15s;
}
.sub-title:hover {
  background: #f3f8fe;
  color: #1e88e5;
}
/* 父级包含当前激活路由时，sub-title 也高亮 */
.sub-title.active {
  color: #1e88e5;
  font-weight: 600;
}

/* ========== 箭头 ========== */
/* 用 CSS border 画三角形：
   border 三个方向透明 + 一个方向有颜色 → 就是三角形 */
.arrow {
  margin-left: auto;              /* 推到最右边 */
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid #99adc1; /* ▾ 向下的三角 */
  transition: transform 0.2s;    /* 旋转动画 */
}
/* details 展开时，箭头旋转 180° → 变成 ▴ */
.sub-menu[open] > summary .arrow {
  transform: rotate(180deg);
}

/* ========== 子菜单展开动画 ========== */
/* details 原生展开没有动画，用 max-height 模拟：
   默认 max-height: 0 收起，overflow:hidden 把内容裁掉
   展开时 max-height 设一个足够大的值，配合 transition */
.sub-menu > .menu-list {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.25s ease-out;
}
.sub-menu[open] > .menu-list {
  max-height: 2000px;            /* 设得比实际内容大，动画会在内容高度处自然停止 */
}
</style>
