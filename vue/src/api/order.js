import service from '@/utils/request'

// 工单列表（筛选：keyword / dept / type / status / priority / dateFrom / dateTo / submitterId / handlerId）
export function listOrders(params = {}) {
  return service.get('/orders', { params })
}

// 工单详情（含处理日志）
export function getOrder(id) {
  return service.get(`/orders/${id}`)
}

// 创建工单
export function createOrder(data) {
  return service.post('/orders', data)
}

// 编辑工单
export function updateOrder(id, data) {
  return service.put(`/orders/${id}`, data)
}

// 状态流转：action = accept / reject / complete / close（reject 需 reason）
export function updateOrderStatus(id, action, reason) {
  return service.patch(`/orders/${id}/status`, { action, reason })
}

// 分配工单（仅部长/超管）
export function assignOrder(id, handlerId) {
  return service.patch(`/orders/${id}/assign`, { handlerId })
}

// 催办（仅提交人）
export function urgeOrder(id) {
  return service.post(`/orders/${id}/urge`)
}

// 批量关闭（仅部长/超管）
export function batchCloseOrders(ids) {
  return service.post('/orders/batch-close', { ids })
}

// 删除工单（仅超管，软删除）
export function deleteOrder(id) {
  return service.delete(`/orders/${id}`)
}
