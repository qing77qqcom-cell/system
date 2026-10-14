import { formatDateTime } from './datetime.js'

// users 表行 → 接口契约的 User 对象（camelCase，绝不含密码字段）
export const toUserDTO = (row) => ({
  id: row.id,
  username: row.username,
  name: row.name,
  role: row.role,
  dept: row.dept,
  email: row.email,
  status: row.status,
  createdAt: formatDateTime(row.created_at),
})

// orders 联表行 → 契约的 Order 对象（§3.3：submitter/handler 内联姓名，时间 'YYYY-MM-DD HH:mm'）
export const toOrderDTO = (row) => ({
  id: row.id,
  title: row.title,
  type: row.type,
  dept: row.dept,
  priority: row.priority,
  status: row.status,
  submitter: row.submitter_name,
  handler: row.handler_name || null,
  createdAt: formatDateTime(row.created_at),
  deadline: formatDateTime(row.deadline),
  completedAt: formatDateTime(row.completed_at),
  description: row.description,
  attachments: row.attachments || [],
  extra: row.extra || {},
})

// order_logs 联表行 → 契约的日志对象（与前端 logs 数组结构一致）
export const toLogDTO = (row) => ({
  user: row.user_name,
  time: formatDateTime(row.created_at),
  action: row.action,
  remark: row.remark || '',
})
