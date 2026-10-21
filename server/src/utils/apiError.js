// 业务异常：抛出后由 errorHandler 统一转为 JSON 响应
// 业务码对照 api-design.md §9 错误码表
const STATUS_TO_CODE = { 400: 1001, 401: 1002, 403: 1003, 404: 1004, 409: 1005, 413: 1006, 500: 1500 }

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message)
    this.status = status
    this.code = code ?? STATUS_TO_CODE[status] ?? 1500
  }
}
