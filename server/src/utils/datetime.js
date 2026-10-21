// 日期时间工具：API 层日期一律输出 'YYYY-MM-DD HH:mm' 字符串（东八区）
// 实现与时区无关：手动 +8 小时后取 UTC 分量，避免依赖进程 TZ 设置
import { isDateString, isDateTimeString } from './validate.js'

const pad = (n) => String(n).padStart(2, '0')

// Date | timestamp → 'YYYY-MM-DD HH:mm'
export const formatDateTime = (value) => {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const t = new Date(d.getTime() + 8 * 60 * 60 * 1000)
  return (
    `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ` +
    `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`
  )
}

// 'YYYY-MM-DD HH:mm'（按东八区）→ Date
export const parseDateTime = (s) => {
  if (!isDateTimeString(s)) return null
  return new Date(`${s.replace(' ', 'T')}:00+08:00`)
}

// 'YYYY-MM-DD'（按东八区当日 00:00）→ Date
export const parseDate = (s) => {
  if (!isDateString(s)) return null
  return new Date(`${s}T00:00:00+08:00`)
}
