import service from '@/utils/request'

// 工单 CRUD + 动作（后端路由前缀 /api/tickets）
export function listOrders(params = {}) {
  return service.get('/tickets', { params })
}

export function getOrder(id) {
  return service.get(`/tickets/${id}`)
}

export function createOrder(data) {
  return service.post('/tickets', data)
}

export function updateOrder(id, data) {
  return service.put(`/tickets/${id}`, data)
}

export function updateOrderStatus(id, action, reason) {
  return service.post(`/tickets/${id}/actions`, { action, reason })
}

export function assignOrder(id, handlerId) {
  return service.post(`/tickets/${id}/actions`, { action: 'assign', handlerId })
}

export function urgeOrder(id) {
  return service.post(`/tickets/${id}/actions`, { action: 'urge' })
}

export function batchCloseOrders(ids) {
  return service.post(`/tickets/actions/batch-close`, { ids })
}

export function deleteOrder(id) {
  return service.delete(`/tickets/${id}`)
}
