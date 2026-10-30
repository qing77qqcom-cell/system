import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'oa_token'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  // ====== 状态 ======
  const token = ref('')
  const user = ref(null)
  const permissions = ref(new Set())   // 当前 role 的所有 perm_code
  const routesGenerated = ref(false)    // 动态路由是否已注册

  function initFromStorage() {
    const saved = loadFromStorage()
    if (saved) {
      token.value = saved.token || ''
      user.value = saved.user || null
    }
  }

  // ====== 计算属性 ======
  const isLoggedIn = computed(() => !!token.value && !!user.value)
  const role = computed(() => user.value?.role || '')
  const userName = computed(() => user.value?.name || '未登录')
  const isAdmin = computed(() => role.value === '超级管理员')
  const isLeader = computed(() => role.value === '技术部部长')
  const isStaff = computed(() => role.value === '技术部普通员工')

  // 从 permissions Set 派生 field:readonly 数组，给 DynamicForm 用
  const readonlyExtraFields = computed(() =>
    [...permissions.value]
      .filter((p) => p.startsWith('field:readonly:'))
      .map((p) => p.replace('field:readonly:', ''))
  )

  // ====== 基本动作 ======

  function setAuth(payload) {
    token.value = payload.token
    user.value = payload.user
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }

  async function refreshMe() {
    try {
      const { default: axios } = await import('@/utils/request')
      const me = await axios.get('/users/me')
      user.value = me
      const saved = loadFromStorage() || {}
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, user: me }))
    } catch {
      // 401 会被拦截器处理并调用 logout
    }
  }

  function resetPermissions() {
    permissions.value = new Set()
    routesGenerated.value = false
  }

  function logout() {
    token.value = ''
    user.value = null
    resetPermissions()
    localStorage.removeItem(STORAGE_KEY)
  }

  // ====== 权限动作 ======

  async function loadPermissions() {
    try {
      const { listRolePermissions } = await import('@/api/tickets')
      const all = await listRolePermissions()
      permissions.value = new Set(
        all.filter((p) => p.role === role.value).map((p) => p.permCode)
      )
    } catch {
      permissions.value = new Set()
    }
  }

  function hasPerm(code) {
    return permissions.value.has(code)
  }

  // ====== 初始化 ======
  initFromStorage()

  return {
    // state
    token, user, permissions, routesGenerated,
    // getters
    isLoggedIn, role, userName, isAdmin, isLeader, isStaff,
    readonlyExtraFields,
    hasPerm,
    // actions
    setAuth, refreshMe, logout,
    loadPermissions, resetPermissions,
  }
})
