import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { SEED_ORDERS } from '@/mock/data'
import { currentUser, formatDate, formatDateTime, genOrderId, isOverdue } from '@/utils/helpers'

const STORAGE_KEY = 'oa_work_orders_v1'

// 从 localStorage 读取，首次使用种子数据
function loadOrders() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* 忽略解析异常，回退种子数据 */
  }
  return JSON.parse(JSON.stringify(SEED_ORDERS))
}

export const useWorkOrderStore = defineStore('workOrder', () => {
  const orders = ref(loadOrders())
  const loading = ref(false)
  const error = ref(false)
  // 请求令牌：模拟竞态场景下只认最后一次请求
  let fetchToken = 0

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders.value))
  }

  // 模拟列表接口：500ms 延迟，forceError 时模拟请求失败
  function fetchList(forceError = false, delay = 500) {
    loading.value = true
    error.value = false
    const token = ++fetchToken
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (token !== fetchToken) return
        loading.value = false
        if (forceError) {
          error.value = true
          reject(new Error('模拟接口异常'))
        } else {
          resolve(orders.value)
        }
      }, delay)
    })
  }

  function getById(id) {
    return orders.value.find((o) => o.id === id)
  }

  function addLog(id, log) {
    const order = getById(id)
    if (order) {
      order.logs.push({ time: formatDateTime(), ...log })
      persist()
    }
  }

  // 新建工单
  function createOrder(form) {
    const now = formatDateTime()
    const order = {
      id: genOrderId(orders.value),
      title: form.title,
      type: form.type,
      dept: form.dept,
      priority: form.priority,
      submitter: form.submitter,
      handler: '',
      status: '待处理',
      createdAt: now,
      deadline: form.deadline,
      completedAt: null,
      description: form.description,
      attachments: form.attachments || [],
      extra: { ...form.extra },
      logs: [{ user: form.submitter, time: now, action: '提交工单' }],
    }
    orders.value.unshift(order)
    persist()
    return order
  }

  // 编辑工单
  function updateOrder(id, form) {
    const order = getById(id)
    if (!order) return null
    Object.assign(order, {
      title: form.title,
      type: form.type,
      dept: form.dept,
      priority: form.priority,
      submitter: form.submitter,
      deadline: form.deadline,
      description: form.description,
      attachments: form.attachments || [],
      extra: { ...form.extra },
    })
    order.logs.push({ user: form.submitter, time: formatDateTime(), action: '编辑工单' })
    persist()
    return order
  }

  // 删除工单
  function removeOrders(ids) {
    orders.value = orders.value.filter((o) => !ids.includes(o.id))
    persist()
  }

  // 批量关闭：待处理、处理中的工单可关闭，返回实际关闭数量
  function batchClose(ids) {
    let count = 0
    orders.value.forEach((o) => {
      if (ids.includes(o.id) && ['待处理', '处理中'].includes(o.status)) {
        o.status = '已关闭'
        o.logs.push({ user: currentUser(), time: formatDateTime(), action: '批量关闭工单' })
        count++
      }
    })
    persist()
    return count
  }

  // 催办：追加一条催办记录
  function urge(id) {
    addLog(id, { user: currentUser(), action: '催办', remark: '请尽快处理该工单，谢谢！' })
  }

  // 退回
  function rejectOrder(id, reason) {
    const order = getById(id)
    if (!order) return
    order.status = '已退回'
    order.logs.push({ user: currentUser(), time: formatDateTime(), action: '退回工单', remark: reason })
    persist()
  }

  // 标记完成
  function completeOrder(id) {
    const order = getById(id)
    if (!order) return
    order.status = '已完成'
    order.completedAt = formatDateTime()
    order.logs.push({ user: currentUser(), time: order.completedAt, action: '完成工单' })
    persist()
  }

  // 关闭单个工单
  function closeOrder(id) {
    const order = getById(id)
    if (!order) return
    order.status = '已关闭'
    order.logs.push({ user: currentUser(), time: formatDateTime(), action: '关闭工单' })
    persist()
  }

  // 工作台统计
  const stats = computed(() => {
    const all = orders.value
    return {
      pending: all.filter((o) => o.status === '待处理').length,
      processing: all.filter((o) => o.status === '处理中').length,
      overdue: all.filter((o) => isOverdue(o)).length,
      monthDone: all.filter(
        (o) => o.status === '已完成' && (o.completedAt || '').startsWith(formatDate().slice(0, 7)),
      ).length,
    }
  })

  // 我的待办：待处理 + 处理中，按截止时间升序
  const todoList = computed(() =>
    orders.value
      .filter((o) => ['待处理', '处理中'].includes(o.status))
      .sort((a, b) => (a.deadline > b.deadline ? 1 : -1)),
  )

  return {
    orders,
    loading,
    error,
    stats,
    todoList,
    fetchList,
    getById,
    createOrder,
    updateOrder,
    removeOrders,
    batchClose,
    urge,
    rejectOrder,
    completeOrder,
    closeOrder,
  }
})
