import { ApiError } from '../utils/apiError.js'

// 404：未匹配到任何路由
export const notFound = (req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在', data: null })
}

// 统一错误处理：保持响应结构 { code, message, data } 一致
export function errorHandler(err, req, res, next) {
  // 业务异常
  if (err instanceof ApiError) {
    return res.status(err.status).json({ code: err.code, message: err.message, data: null })
  }

  // multer 附件超限
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ code: 413, message: '附件大小超出限制', data: null })
  }

  // 请求体 JSON 解析失败
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ code: 400, message: '请求体格式错误（非法 JSON）', data: null })
  }

  // 未知错误：开发环境打印堆栈，响应不泄漏内部细节
  console.error('[未处理错误]', err)
  res.status(500).json({ code: 500, message: '服务器内部错误', data: null })
}
