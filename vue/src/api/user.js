import service from '@/utils/request'

// 登录（信封已由响应拦截器拆解）
export function login(data) {
  return service.post('/login', data)
}

// 退出登录（后端写登出日志；JWT 无黑名单，客户端销毁 token 即可）
export function logout() {
  return service.post('/logout')
}

// 用户列表（支持 keyword / role / status 筛选）
export function listUsers(params = {}) {
  return service.get('/users', { params })
}

// 用户详情
export function getUser(id) {
  return service.get(`/users/${id}`)
}

// 创建用户（仅超管，默认密码 123456）
export function createUser(data) {
  return service.post('/users', data)
}

// 编辑用户（仅超管，username 不可改）
export function updateUser(id, data) {
  return service.put(`/users/${id}`, data)
}

// 启用/禁用用户（仅超管）
export function toggleUserStatus(id, status) {
  return service.patch(`/users/${id}/status`, { status })
}

// 重置密码为 123456（仅超管）
export function resetUserPassword(id) {
  return service.patch(`/users/${id}/password`)
}

// 删除用户（仅超管）
export function deleteUser(id) {
  return service.delete(`/users/${id}`)
}

// 获取当前登录用户信息
export function getMe() {
  return service.get('/users/me')
}
