import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/store.js'

const service = axios.create({
  baseURL: '/api', // 后端统一前缀，配合 vite dev proxy 转发到 localhost:3000
  timeout: 5000,
})

// 开发期 HTTP 日志：只在 vite dev 模式打印，生产构建自动移除
const DEV = import.meta.env.DEV

// 请求拦截器：自动携带 JWT + 记录请求开始时间
// 注意：模块加载时 store 已在 main.js 注册（app.use(createPinia()) 在 import router 之前），
// 拦截器运行时 store 一定可用——静态 import 不会导致 "store not installed"
service.interceptors.request.use((config) => {
  const store = useAuthStore()
  if (store.token) config.headers.Authorization = `Bearer ${store.token}`
  if (DEV) {
    config._startAt = performance.now()
    const { method, url, params, data } = config
    console.log(
      `%c[HTTP] → ${method?.toUpperCase()} ${url}`,
      'color:#1e88e5;font-weight:600',
      params ? { params } : '',
      data ? { data } : '',
    )
  }
  return config
})

// 响应拦截器：拆信封 { code, message, data } → 直接返回业务数据；统一错误处理
service.interceptors.response.use(
  (response) => {
    if (DEV) {
      const ms = Math.round(performance.now() - response.config._startAt)
      const { method, url } = response.config
      console.log(
        `%c[HTTP] ← ${method?.toUpperCase()} ${url}  ${response.status}  ${ms}ms`,
        'color:#2e7d32;font-weight:600',
        response.data,
      )
    }
    return response.data.data
  },
  (error) => {
    const status = error.response?.status
    const message = error.response?.data?.message || '网络异常，请稍后重试'
    const isLoginRequest = error.config?.url?.includes('/login')

    if (DEV) {
      const ms = error.config._startAt
        ? Math.round(performance.now() - error.config._startAt)
        : '?'
      const { method, url } = error.config
      console.error(
        `[HTTP] ✗ ${method?.toUpperCase()} ${url}  ${status ?? 'ERR'}  ${ms}ms`,
        error.response?.data || error.message,
      )
    }

    // 401 且非登录接口：token 过期/账号被禁用 → 清 store 回登录页
    if (status === 401 && !isLoginRequest) {
      useAuthStore().logout()
      ElMessage.error(message)
      window.location.href = '/login'
    } else {
      ElMessage.error(message)
    }
    return Promise.reject(error)
  },
)

export default service
