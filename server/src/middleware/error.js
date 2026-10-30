import { ApiError } from '../utils/apiError.js'

// 404：未匹配到任何路由
export const notFound = (req, res) => {
  res.status(404).json({ code: 1004, message: '接口不存在', data: null })
}

// 统一错误处理：保持响应结构 { code, message, data } 一致
export function errorHandler(err, req, res, next) {
  // 业务异常
  if (err instanceof ApiError) {
    return res.status(err.status).json({ code: err.code, message: err.message, data: null })
  }

  // PG 唯一约束冲突（幂等键/唯一索引兜底）
  if (err?.code === '23505') {
    return res.status(409).json({ code: 1005, message: '数据冲突，请勿重复提交', data: null })
  }

  // multer 附件超限
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ code: 1006, message: '附件大小超出限制', data: null })
  }

  // 请求体 JSON 解析失败
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ code: 1001, message: '请求体格式错误（非法 JSON）', data: null })
  }

  // 未知错误：开发环境打印完整堆栈（含 pg 业务错误）
  console.error('[未处理错误]', err?.stack || err)
  res.status(500).json({ code: 1500, message: '服务器内部错误', data: null })
}
