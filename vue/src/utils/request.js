
import axios from 'axios'
const service = axios.create({
  baseURL: '/api', // 这里写 /api，后续接口就不用重复写了！
  timeout: 5000
})
// 请求拦截器、响应拦截器：统一处理token、错误提示
export default service
