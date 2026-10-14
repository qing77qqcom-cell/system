import { ApiError } from './apiError.js'

// 条件断言：不满足直接抛业务异常
export const assert = (condition, message, status = 400) => {
  if (!condition) throw new ApiError(status, message)
}

export const isDateString = (s) =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

export const isDateTimeString = (s) =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)

export const isEmail = (s) =>
  typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
