import service from '@/utils/request'

// 登录：成功返回 { token, user }（信封已由响应拦截器拆解）
export function login(data) {
  return service.post('/login', data)
}

// 获取当前登录用户信息（用于刷新用户状态，如被禁用/信息变更）
export function getMe() {
  return service.get('/users/me')
}
