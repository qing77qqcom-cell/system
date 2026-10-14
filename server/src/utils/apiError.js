// 业务异常：抛出后由 errorHandler 统一转为 JSON 响应
export class ApiError extends Error {
  constructor(status, message, code = status) {
    super(message)
    this.status = status
    this.code = code
  }
}
