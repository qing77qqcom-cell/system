// 日期补零
const pad = (n) => String(n).padStart(2, '0')

// 格式化为 YYYY-MM-DD HH:mm
export function formatDateTime(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

// 格式化为 YYYY-MM-DD
export function formatDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// 生成工单编号：WO + 年月日 + 3 位序号
export function genOrderId(existingOrders = []) {
  const prefix = `WO${formatDate().replaceAll('-', '')}`
  const seq = existingOrders.filter((o) => o.id.startsWith(prefix)).length + 1
  return `${prefix}${String(seq).padStart(3, '0')}`
}

// 判断工单是否逾期：仅待处理/处理中，且截止时间早于当前时间
export function isOverdue(order) {
  return (
    ['待处理', '处理中'].includes(order.status) &&
    !!order.deadline &&
    order.deadline < formatDateTime()
  )
}

// 根据当前小时返回问候语
export function greeting() {
  const h = new Date().getHours()
  if (h < 6) return '凌晨好'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

// 获取当前登录用户名（无权限设计，仅做展示）
export function currentUser() {
  try {
    return JSON.parse(localStorage.getItem('oa_token') || '{}').username || '张三'
  } catch {
    return '张三'
  }
}
