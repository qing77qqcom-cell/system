import { ref } from 'vue'
import { defineStore } from 'pinia'
import { SEED_USERS } from '@/mock/users'
import { formatDateTime } from '@/utils/helpers'

const STORAGE_KEY = 'oa_users_v1'

// 从 localStorage 读取，首次使用种子数据
function loadUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* 忽略解析异常，回退种子数据 */
  }
  return JSON.parse(JSON.stringify(SEED_USERS))
}

export const useUserStore = defineStore('user', () => {
  const users = ref(loadUsers())
  const loading = ref(false)

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users.value))
  }

  // 模拟列表请求：500ms 延迟
  function fetchList(delay = 500) {
    loading.value = true
    return new Promise((resolve) => {
      setTimeout(() => {
        loading.value = false
        resolve(users.value)
      }, delay)
    })
  }

  function getById(id) {
    return users.value.find((u) => u.id === id)
  }

  // 新增用户
  function addUser(form) {
    const id = Date.now()
    users.value.unshift({
      id,
      ...form,
      status: '启用',
      createdAt: formatDateTime(),
      password: '123456',
    })
    persist()
  }

  // 编辑用户
  function updateUser(id, form) {
    const u = getById(id)
    if (!u) return null
    Object.assign(u, form)
    persist()
    return u
  }

  // 删除用户
  function removeUsers(ids) {
    users.value = users.value.filter((u) => !ids.includes(u.id))
    persist()
  }

  // 启用 / 禁用
  function toggleStatus(id) {
    const u = getById(id)
    if (!u) return
    u.status = u.status === '启用' ? '禁用' : '启用'
    persist()
  }

  // 重置密码为默认密码
  function resetPassword(id) {
    const u = getById(id)
    if (!u) return
    u.password = '123456'
    persist()
  }

  return {
    users,
    loading,
    fetchList,
    getById,
    addUser,
    updateUser,
    removeUsers,
    toggleStatus,
    resetPassword,
  }
})
