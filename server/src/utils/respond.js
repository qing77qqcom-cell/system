// 统一响应包装：{ code, message, data }（status 用于 201 等场景）
export const ok = (res, data = null, message = 'ok', status = 200) =>
  res.status(status).json({ code: 0, message, data })
