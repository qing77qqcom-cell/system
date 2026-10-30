// 统一 loading 状态管理
// 解决的痛点：项目里 5 个组件都写了 `loading.value = true → try → finally loading.value = false`
//          这是跨组件重复的"状态管理套路"，但又不是需要持久化/跨组件共享的全局状态 → 不属于 stores
//          也不是纯工具函数（它管的是 ref 状态）→ 不属于 utils
//          恰好是 composables 的主战场："带状态的可复用逻辑片段"

import { ref } from 'vue'

/**
 * 管理一个异步请求的 loading 状态
 *
 * 为什么放 composable 不放 utils？
 * - utils 里的函数是纯的（formatDate / genOrderId），不碰 ref / reactive
 * - useLoading 返回响应式 ref，内部逻辑会 mutate 它 —— 这是 Vue 专属的组合逻辑
 *
 * 为什么不放 store？
 * - store 是"跨组件共享的全局状态"；A 页面的 loading 跟 B 页面的 loading 没关系
 * - 每个组件自己调用 `const { loading, run } = useLoading()` 拿到独立的 ref 实例
 *
 * @example
 *   const { loading, run } = useLoading()
 *   const data = await run(() => axios.get('/api/users'))
 *   // loading 自动 true → 执行 → finally false
 */
export function useLoading() {
  const loading = ref(false)

  async function run(fn) {
    loading.value = true
    try {
      return await fn()
    } finally {
      loading.value = false
    }
  }

  return { loading, run }
}
