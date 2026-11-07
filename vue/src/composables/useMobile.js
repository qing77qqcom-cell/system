import { ref, onMounted, onUnmounted } from 'vue'

/**
 * 响应式移动端检测（断点 768px，和 App.vue 的 @media 一致）
 *
 * 用法：
 *   const { isMobile, isTablet, isDesktop, width } = useMobile()
 *   if (isMobile.value) { ... }
 *
 * 设计：
 *   - window.matchMedia 监听 orientationchange + resize，SSR 安全（mount 前返回 false）
 *   - 只初始化一次（模块级单例），避免每个组件都注册一次监听
 */

const BREAKPOINT = 768

// 模块级单例：保证多个组件 import 时共享同一个响应式状态
const width = ref(typeof window !== 'undefined' ? window.innerWidth : 1200)
const isMobile = ref(width.value < BREAKPOINT)
const isTablet = ref(width.value >= BREAKPOINT && width.value < 1024)
const isDesktop = ref(width.value >= 1024)

let listenerBound = false
function bindListener() {
  if (listenerBound || typeof window === 'undefined') return
  listenerBound = true
  const sync = () => {
    width.value = window.innerWidth
    isMobile.value = width.value < BREAKPOINT
    isTablet.value = width.value >= BREAKPOINT && width.value < 1024
    isDesktop.value = width.value >= 1024
  }
  window.addEventListener('resize', sync)
  window.addEventListener('orientationchange', sync)
}

export function useMobile() {
  onMounted(bindListener)
  return { width, isMobile, isTablet, isDesktop }
}
