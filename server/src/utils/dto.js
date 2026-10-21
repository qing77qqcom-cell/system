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

// tickets 联表行 → 契约的 Ticket 对象（applicant/handler 内联姓名，时间 'YYYY-MM-DD HH:mm'）
export const toTicketDTO = (row) => ({
  id: row.id,
  type: row.type,
  status: row.status,
  priority: row.priority,
  faultCategory: row.fault_category,
  title: row.title,
  description: row.description,
  dept: row.dept,
  applicantId: row.applicant_id,
  applicant: row.applicant_name,
  handlerId: row.current_handler_id ?? null,
  handler: row.handler_name ?? null,
  currentRound: row.current_round,
  escalatedLevel: row.escalated_level,
  slaExempt: row.sla_exempt,
  reopenCount: row.reopen_count,
  extra: row.extra || {},
  attachments: row.attachments || [],
  version: row.version,
  firstSubmittedAt: formatDateTime(row.first_submitted_at),
  closedAt: formatDateTime(row.closed_at),
  archivedAt: formatDateTime(row.archived_at),
  createdAt: formatDateTime(row.created_at),
  updatedAt: formatDateTime(row.updated_at),
})

// 列表接口附带的 overall SLA 记录（api-design.md §10.5：前端只渲染不算时）
export const toOverallSlaDTO = (row) =>
  row
    ? {
        slaStatus: row.sla_status,
        deadlineAt: formatDateTime(row.deadline_at),
        isBreached: row.is_breached,
      }
    : null

// ticket_logs 联表行 → 时间线日志（代执行展示「（代财务部角色）」后缀）
export const toTicketLogDTO = (row) => ({
  id: row.id,
  action: row.action,
  fromStatus: row.from_status,
  toStatus: row.to_status,
  user: row.user_name
    ? row.user_name + (row.metadata?.proxy === 'builtin_finance' ? '（代财务部角色）' : '')
    : '系统',
  operatorId: row.operator_id,
  triggerSource: row.trigger_source,
  remark: row.remark || '',
  metadata: row.metadata || null,
  time: formatDateTime(row.created_at),
})

// approval_records 行 → 工单详情内嵌的审批摘要
export const toApprovalDTO = (row) => ({
  id: row.id,
  round: row.round,
  seq: row.seq,
  nodeName: row.node_name,
  assigneeId: row.assignee_id ?? null,
  assignee: row.assignee_name ?? null,
  assigneeRole: row.assignee_role,
  status: row.status,
  comment: row.comment,
  assignedAt: formatDateTime(row.assigned_at),
  actedAt: formatDateTime(row.acted_at),
  actedBy: row.acted_by ?? null,
  actedByName: row.acted_by_name
    ? row.acted_by_name + (row.acted_as === 'builtin_finance' ? '（代财务部角色）' : '')
    : null,
  actedAs: row.acted_as,
})
