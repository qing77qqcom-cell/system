// 业务常量：严格对应 docs/database-design.md 枚举与 api-design.md §0.2 权限矩阵

// 3 个登录角色（内置财务部无登录账号，仅作为审批队列标识）
// roles 母体表存储 code + name + description，users.role 存 role_code
export const ROLES = {
  ADMIN: 'admin',
  LEADER: 'leader',
  STAFF: 'staff',
}
// role_code → 中文名称（与 roles.name 一致，用于日志/API 输出）
export const ROLE_LABELS = {
  admin: '超级管理员',
  leader: '部门部长',
  staff: '普通员工',
}
export const ROLE_LIST = Object.values(ROLES)
export const BUILTIN_FINANCE = 'builtin_finance' // 内置财务部队列标识

export const TICKET_TYPES = ['fault_repair', 'account_permission', 'reimbursement']

export const STATUS = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  PENDING_ASSIGNMENT: 'pending_assignment',
  PENDING_ACCEPTANCE: 'pending_acceptance',
  PENDING_PROCESSING: 'pending_processing',
  PROCESSING: 'processing',
  PENDING_CONFIRMATION: 'pending_confirmation',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
  CLOSED: 'closed',
}
export const TERMINAL_STATUS = [STATUS.CANCELLED, STATUS.CLOSED]
// 活跃态（suspend/escalate/change_priority/sla_exempt 等动作的可用范围）
export const ACTIVE_STATUS = [
  STATUS.PENDING_APPROVAL,
  STATUS.PENDING_ASSIGNMENT,
  STATUS.PENDING_ACCEPTANCE,
  STATUS.PENDING_PROCESSING,
  STATUS.PROCESSING,
  STATUS.PENDING_CONFIRMATION,
]

export const ACTIONS = [
  'submit', 'approve', 'reject_approval', 'assign', 'reassign', 'accept', 'transfer',
  'start', 'resolve', 'confirm', 'supplement', 'suspend', 'resume', 'cancel', 'close',
  'reopen', 'escalate', 'change_priority', 'sla_exempt', 'mark_paid',
]

export const SLA_METRICS = ['first_response', 'approval', 'processing', 'confirmation', 'payment', 'overall']

// 动作 → 前置状态白名单（状态机；to 由路由按类型/上下文推导，见 routes/tickets.js）
export const ACTION_FROM_STATUS = {
  submit: [STATUS.DRAFT],
  approve: [STATUS.PENDING_APPROVAL],
  reject_approval: [STATUS.PENDING_APPROVAL],
  assign: [STATUS.PENDING_ASSIGNMENT],
  reassign: [STATUS.PENDING_ACCEPTANCE],
  accept: [STATUS.PENDING_ACCEPTANCE],
  transfer: [STATUS.PENDING_PROCESSING, STATUS.PROCESSING],
  start: [STATUS.PENDING_PROCESSING],
  resolve: [STATUS.PROCESSING],
  confirm: [STATUS.PENDING_CONFIRMATION],
  supplement: [...ACTIVE_STATUS, STATUS.SUSPENDED], // 非终态
  suspend: ACTIVE_STATUS,
  resume: [STATUS.SUSPENDED],
  cancel: [...ACTIVE_STATUS, STATUS.SUSPENDED, STATUS.DRAFT], // 非终态
  reopen: [STATUS.CLOSED],
  escalate: ACTIVE_STATUS,
  change_priority: ACTIVE_STATUS,
  sla_exempt: ACTIVE_STATUS,
  mark_paid: [STATUS.PENDING_PROCESSING, STATUS.PROCESSING],
}

// 动作 → 允许的角色（api-design.md §0.2；附加条件在路由内逐动作校验）
export const ACTION_ROLES = {
  submit: ROLE_LIST,
  supplement: ROLE_LIST,
  cancel: ROLE_LIST,
  confirm: ROLE_LIST,
  reopen: ROLE_LIST,
  approve: [ROLES.ADMIN, ROLES.LEADER],
  reject_approval: [ROLES.ADMIN, ROLES.LEADER],
  assign: [ROLES.ADMIN, ROLES.LEADER],
  reassign: [ROLES.ADMIN, ROLES.LEADER],
  transfer: [ROLES.ADMIN, ROLES.LEADER],
  suspend: [ROLES.ADMIN, ROLES.LEADER],
  resume: [ROLES.ADMIN, ROLES.LEADER],
  escalate: [ROLES.ADMIN, ROLES.LEADER],
  change_priority: [ROLES.ADMIN, ROLES.LEADER],
  sla_exempt: [ROLES.ADMIN, ROLES.LEADER],
  accept: [ROLES.ADMIN, ROLES.STAFF],
  start: [ROLES.ADMIN, ROLES.STAFF],
  resolve: [ROLES.ADMIN, ROLES.STAFF],
  mark_paid: [ROLES.ADMIN],
}

// 数据范围规则（文档 §0.1，三条硬规则）。params 为外部传入的参数数组，函数就地 push 并返回带正确 $n 的 WHERE 片段
export const scopeSql = (user, alias, params) => {
  if (user.role === ROLES.ADMIN) return 'TRUE'
  if (user.role === ROLES.LEADER) {
    params.push(user.dept)
    return `${alias}.dept = $${params.length}`
  }
  params.push(user.id, user.id)
  return `(${alias}.applicant_id = $${params.length - 1} OR ${alias}.current_handler_id = $${params.length})`
}
