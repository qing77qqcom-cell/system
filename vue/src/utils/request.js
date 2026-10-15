import axios from 'axios'
import { ElMessage } from 'element-plus'

const service = axios.create({
  baseURL: '/api', // 后端统一前缀，配合 vite dev proxy 转发到 localhost:3000
  timeout: 5000,
})

// 从本地存储读取 token（存储结构：{ token, user }）
function getToken() {
  try {
    return JSON.parse(localStorage.getItem('oa_token') || '{}').token || ''
  } catch {
    return ''
  }
}

// 请求拦截器：自动携带 JWT
service.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 响应拦截器：拆信封 { code, message, data } → 直接返回业务数据；统一错误处理
service.interceptors.response.use(
  (response) => response.data.data,
  // 业务数据直接返回，无需拆解信封
  (error) => {
    const status = error.response?.status
    const message = error.response?.data?.message || '网络异常，请稍后重试'
    const isLoginRequest = error.config?.url?.includes('/login')

    // 401 且非登录接口：token 过期/账号被禁用 → 清登录态回登录页
    if (status === 401 && !isLoginRequest) {
      localStorage.removeItem('oa_token')
      ElMessage.error(message)
      window.location.href = '/login'
    } else {
      ElMessage.error(message)
    }
    return Promise.reject(error)
  },
)

export default service
