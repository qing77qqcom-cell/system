// 角色能力判断 composable
// 解决的痛点：WorkOrderDetail / WorkOrderForm / UserList 里都写了
//   `['技术部部长', '超级管理员'].includes(auth.role)` / `auth.isAdmin`
//          散落在 4 处组件里，新增角色或改名时要全项目搜着改

import { computed } from 'vue'
import { useAuthStore } from '@/stores/store.js'

/**
 * 根据当前登录用户计算各种"能不能做"的布尔值
 *
 * 为什么放 composable？
 * - 它依赖 store（读 auth.role），但 store 只存原始数据（token / user）
 * - 这里是 store 的"派生能力"，放在 store 里会让 store 膨胀（每个组件各自算一遍
 *   和统一算一遍一样，但集中在此更清晰 —— 类似 Pinia 的 getters，但可以跨 store 组合）
 *
 * 为什么不放 utils？
 * - 它返回 computed（响应式），而 utils 里的函数不会返回 computed
 * - utils 是无状态的，这里依赖登录态变化自动更新
 *
 * @example
 *   // 组件内
 *   const { canAssign, canExport } = useRoleCan()
 *   // 模板里直接用 v-if="canAssign"
 */
export function useRoleCan() {
  const auth = useAuthStore()

  const isLeaderOrAdmin = computed(() => auth.isLeader || auth.isAdmin)

  // 动作级权限：从 permissions Set 派生（未来 router.addRoute + role_permissions 全量接入）
  const canAssign    = computed(() => auth.hasPerm('action:assign'))
  const canApprove   = computed(() => auth.hasPerm('action:approve'))
  const canResolve   = computed(() => auth.hasPerm('action:resolve'))
  const canExport    = computed(() => auth.hasPerm('stats:export'))
  const canManageUsers = computed(() => auth.hasPerm('menu:user-manage'))

  // 字段级权限：从 permissions Set 里过滤 field:readonly:* 前缀，提取字段名
  // 如 permissions 包含 "field:readonly:deviceNo" → 返回 ['deviceNo']
  const readonlyExtraFields = computed(() =>
    [...auth.permissions]
      .filter((p) => p.startsWith('field:readonly:'))
      .map((p) => p.replace('field:readonly:', '')),
  )

  return {
    isLeaderOrAdmin,
    canAssign,
    canApprove,
    canResolve,
    canExport,
    canManageUsers,
    readonlyExtraFields,
  }
}
