import service from '@/utils/request'

// ---------- 认证 ----------
export function login(data) {
  return service.post('/login', data)
}
export function getCurrentUser() {
  return service.get('/users/me')
}

// ---------- 用户 ----------
export function listUsers() {
  return service.get('/users')
}
export function createUser(data) {
  return service.post('/users', data)
}
export function updateUser(id, data) {
  return service.put(`/users/${id}`, data)
}
export function updateUserStatus(id, status) {
  return service.patch(`/users/${id}/status`, { status })
}
export function resetUserPassword(id) {
  return service.patch(`/users/${id}/password`)
}
export function deleteUser(id) {
  return service.delete(`/users/${id}`)
}

// ---------- 工单 ----------
export function listTickets(params = {}) {
  return service.get('/tickets', { params })
}
export function getTicket(id) {
  return service.get(`/tickets/${id}`)
}
export function createTicket(data) {
  return service.post('/tickets', data)
}
export function updateTicket(id, data) {
  return service.put(`/tickets/${id}`, data)
}
/** 统一动作网关 */
export function ticketAction(id, { action, version, business_event_id, ...payload }) {
  return service.post(`/tickets/${id}/actions`, { action, version, business_event_id, ...payload })
}
export function getTicketLogs(id) {
  return service.get(`/tickets/${id}/logs`)
}
export function getTicketSlaRecords(id) {
  return service.get(`/tickets/${id}/sla-records`)
}
export function getTicketSlaEvents(id) {
  return service.get(`/tickets/${id}/sla-events`)
}
export function listSlaRecords(params = {}) {
  return service.get('/sla-records', { params })
}
export function listAbnormalTickets(params = {}) {
  return service.get('/tickets/abnormal', { params })
}
export function getMyTodo() {
  return service.get('/tickets/todo')
}
export function exportTickets(params = {}) {
  return service.get('/tickets/export', { params, responseType: 'blob' })
}

// ---------- 统计 ----------
export function getStatsOverview(params = {}) {
  return service.get('/stats/overview', { params })
}
export function getStatsWorkload(params = {}) {
  return service.get('/stats/workload', { params })
}
export function getStatsSla(params = {}) {
  return service.get('/stats/sla', { params })
}
export function getStatsSlaDetails(params = {}) {
  return service.get('/stats/sla/details', { params })
}
export function getStatsTrend(params = {}) {
  return service.get('/stats/trend', { params })
}
export function getStatsStatusDistribution(params = {}) {
  return service.get('/stats/status-distribution', { params })
}
export function exportStats(params = {}) {
  return service.get('/stats/export', { params, responseType: 'blob' })
}

// ---------- 系统配置 ----------
export function listDictionaries(dict_type) {
  return service.get('/dictionaries', { params: { dict_type } })
}
export function listApprovalFlows(ticket_type) {
  return service.get('/approval-flows', { params: { ticket_type } })
}
export function listSlaRules(ticket_type) {
  return service.get('/sla-rules', { params: { ticket_type } })
}
export function listFormConfigs(ticket_type) {
  return service.get('/form-configs', { params: { ticket_type } })
}
export function listRolePermissions() {
  return service.get('/role-permissions')
}

// ---------- 通知 ----------
export function listNotifications() {
  return service.get('/notifications')
}
export function markNotificationRead(id) {
  return service.patch(`/notifications/${id}/read`)
}
export function markAllNotificationsRead() {
  return service.patch('/notifications/read-all')
}

// ---------- 日志 ----------
export function listLoginLogs(params = {}) {
  return service.get('/login-logs', { params })
}
export function listAuditLogs(params = {}) {
  return service.get('/audit-logs', { params })
}
