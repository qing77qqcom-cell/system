// 工单模块（api-design.md §2）：列表/详情/创建/编辑/统一动作网关/待办/SLA/导出
// 校验顺序（文档强制）：登录 → 角色动作权限(403) → 数据范围(404) → 状态机白名单(409) → payload(400)
import { Router } from 'express'
import { query, withTx } from '../db.js'
import { ok } from '../utils/respond.js'
import { ApiError } from '../utils/apiError.js'
import { assert, isDateString } from '../utils/validate.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { parseDate, formatDateTime } from '../utils/datetime.js'
import { toTicketDTO, toOverallSlaDTO, toTicketLogDTO, toApprovalDTO } from '../utils/dto.js'
import {
  ROLES, BUILTIN_FINANCE, TICKET_TYPES, STATUS, ACTIONS,
  ACTION_FROM_STATUS, ACTION_ROLES, scopeSql,
} from '../constants.js'
import {
  createSlaRecord, completeSlaRecords, cancelSlaRecords,
  pauseSlaRecords, resumeSlaRecords, currentElapsedMs,
} from '../services/sla.js'
import { loadCalendar } from '../services/calendar.js'
import { notifyAsync } from '../services/notify.js'

const router = Router()
router.use(requireAuth)

// 随挂起暂停的指标（database-design.md §5.6：first_response/approval 不暂停）
const PAUSABLE_METRICS = ['processing', 'confirmation', 'payment', 'overall']

// ---------- 通用辅助 ----------

const getParam = async (key, fallback) => {
  const { rows } = await query('SELECT value FROM system_params WHERE key = $1', [key])
  return rows[0] ? rows[0].value : fallback
}

// 数据范围（§0.1）：越权一律 404
const inScope = (user, t) =>
  user.role === ROLES.ADMIN ||
  (user.role === ROLES.LEADER && t.dept === user.dept) ||
  (user.role === ROLES.STAFF && (t.applicant_id === user.id || t.current_handler_id === user.id))

const pad = (n) => String(n).padStart(2, '0')

// 单号：WO + yyyymmdd + 4 位随机（database-design.md §4.1）
const genTicketId = async (client) => {
  const d = new Date()
  const day = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  for (let i = 0; i < 5; i++) {
    const id = `WO${day}${String(Math.floor(1000 + Math.random() * 9000))}`
    const { rows } = await client.query('SELECT 1 FROM tickets WHERE id = $1', [id])
    if (!rows[0]) return id
  }
  throw new ApiError(500, '单号生成失败，请重试')
}

// 工单 UPDATE（乐观锁：payload.version 提供时必须匹配，否则 409）
const updateTicket = async (client, id, version, sets, params) => {
  params.push(id, version ?? null)
  const { rowCount } = await client.query(
    `UPDATE tickets SET ${sets}, version = version + 1, updated_at = now()
      WHERE id = $${params.length - 1} AND ($${params.length}::int IS NULL OR version = $${params.length})`,
    params,
  )
  if (!rowCount) throw new ApiError(409, '版本冲突，请刷新后重试')
}

const insertLog = (client, { ticketId, action, fromStatus = null, toStatus = null, operatorId, remark = null, metadata = null, beId = null }) =>
  client.query(
    `INSERT INTO ticket_logs (ticket_id, action, from_status, to_status, operator_id, remark, metadata, business_event_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [ticketId, action, fromStatus, toStatus, operatorId, remark, metadata ? JSON.stringify(metadata) : null, beId],
  )

const reloadTicket = async (client, id) => {
  const { rows } = await client.query(
    `SELECT t.*, a.name AS applicant_name, h.name AS handler_name, a.role AS applicant_role
       FROM tickets t
       JOIN users a ON a.id = t.applicant_id
       LEFT JOIN users h ON h.id = t.current_handler_id
      WHERE t.id = $1`,
    [id],
  )
  return rows[0]
}

// extra 按 form_field_configs 校验（必填/类型/选项）
const validateExtra = async (queryable, type, extra) => {
  const { rows: fields } = await queryable.query(
    'SELECT * FROM form_field_configs WHERE ticket_type = $1 AND active ORDER BY sort',
    [type],
  )
  for (const f of fields) {
    const v = extra?.[f.field_key]
    const empty = v === undefined || v === null || v === ''
    if (f.required && empty) throw new ApiError(400, `字段 ${f.label} 为必填项`)
    if (empty) continue
    if (f.field_type === 'number') {
      assert(typeof v === 'number' && Number.isFinite(v), `字段 ${f.label} 必须为数字`)
    } else if (f.field_type === 'select') {
      assert(typeof v === 'string' && (f.options || []).includes(v), `字段 ${f.label} 选项不正确`)
    } else if (f.field_type === 'date') {
      assert(isDateString(v), `字段 ${f.label} 日期格式应为 YYYY-MM-DD`)
    } else {
      assert(typeof v === 'string', `字段 ${f.label} 必须为文本`)
    }
  }
}

const assertDictCode = async (dictType, code, label) => {
  const { rows } = await query(
    'SELECT 1 FROM sys_dictionaries WHERE dict_type = $1 AND code = $2 AND active',
    [dictType, code],
  )
  assert(rows[0], `${label}不正确`)
}

// ---------- 审批引擎（approval_flow_nodes + approval_records，与状态机解耦） ----------

// 从 fromSeq 起推进节点：命中跳过规则写 skipped 记录并继续；否则建 pending 记录 + approval SLA；无更多节点返回 null
const advanceApproval = async (client, ticket, round, fromSeq, operatorId) => {
  const { rows: nodes } = await client.query(
    'SELECT * FROM approval_flow_nodes WHERE ticket_type = $1 AND active AND seq >= $2 ORDER BY seq',
    [ticket.type, fromSeq],
  )
  for (const node of nodes) {
    if (node.skip_rule?.applicant_role && node.skip_rule.applicant_role === ticket.applicant_role) {
      await client.query(
        `INSERT INTO approval_records (ticket_id, round, seq, node_name, status, comment, assigned_at, acted_at)
         VALUES ($1,$2,$3,$4,'skipped','申请人角色命中跳过规则', now(), now())`,
        [ticket.id, round, node.seq, node.node_name],
      )
      continue
    }
    let assigneeId = null
    let assigneeRole = null
    if (node.approver_strategy === 'builtin_finance') {
      assigneeRole = BUILTIN_FINANCE // 内置财务部队列：无登录账号，超管待办聚合
    } else if (node.approver_strategy === 'super_admin') {
      const { rows } = await client.query(
        `SELECT id FROM users WHERE role = $1 AND status = '启用' ORDER BY id LIMIT 1`, [ROLES.ADMIN])
      assigneeId = rows[0]?.id ?? null
    } else {
      const { rows } = await client.query(
        `SELECT id FROM users WHERE role = $1 AND dept = $2 AND status = '启用' ORDER BY id LIMIT 1`,
        [ROLES.LEADER, ticket.dept])
      assigneeId = rows[0]?.id ?? null
    }
    await client.query(
      `INSERT INTO approval_records (ticket_id, round, seq, node_name, assignee_id, assignee_role, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending')`,
      [ticket.id, round, node.seq, node.node_name, assigneeId, assigneeRole],
    )
    await createSlaRecord(client, { ticket, metric: 'approval', round, nodeSeq: node.seq, operatorId })
    return node
  }
  return null
}

// 末节点通过后的落态（按类型）：故障→待分配；账号→待处理(处理人=操作人/超管)；报销→待处理(待付款)
const finalizeApproval = async (client, ticket, user, effects, version = null) => {
  const toStatus = ticket.type === 'fault_repair' ? STATUS.PENDING_ASSIGNMENT : STATUS.PENDING_PROCESSING
  const params = []
  let handlerSet = ''
  if (ticket.type === 'account_permission') {
    params.push(user.id) // 账号工单完成后处理人=超管（文档 §7.2 已确认）
    handlerSet = `, current_handler_id = $${params.length}`
  }
  await updateTicket(client, ticket.id, version, `status = '${toStatus}'${handlerSet}`, params)
  if (toStatus === STATUS.PENDING_PROCESSING) {
    // 进入待处理：故障/账号计 processing，报销计 payment（§5.6）
    await createSlaRecord(client, {
      ticket, metric: ticket.type === 'reimbursement' ? 'payment' : 'processing', operatorId: user.id,
    })
  }
  effects.push({
    recipients: [ticket.applicant_id], ticketId: ticket.id, kind: 'ticket_approved',
    templateCode: 'ticket_approved', vars: { title: ticket.title, id: ticket.id },
    eventKey: `approved:${ticket.id}:${ticket.current_round}`,
  })
  return toStatus
}

// submit 动作（创建时直接提交与草稿重提共用）：round+1、首轮/新轮审批记录、overall+first_response SLA
const doSubmit = async (client, ticket, user, { beId = null, version = null, effects }) => {
  const round = ticket.current_round + 1
  const now = new Date()
  const firstSubmittedAt = ticket.first_submitted_at ?? now // 驳回重提不重置（overall 固定起点）
  await updateTicket(client, ticket.id, version,
    `status = 'pending_approval', current_round = $1, first_submitted_at = $2`, [round, firstSubmittedAt])
  await insertLog(client, {
    ticketId: ticket.id, action: 'submit', fromStatus: STATUS.DRAFT,
    toStatus: STATUS.PENDING_APPROVAL, operatorId: user.id, beId,
  })
  const fresh = { ...ticket, first_submitted_at: firstSubmittedAt }
  await createSlaRecord(client, { ticket: fresh, metric: 'overall', startedAt: firstSubmittedAt, operatorId: user.id })
  await createSlaRecord(client, { ticket: fresh, metric: 'first_response', startedAt: now, operatorId: user.id })
  const node = await advanceApproval(client, ticket, round, 1, user.id)
  if (!node) {
    // 未配置审批节点：视同审批完成直接落下一状态
    await finalizeApproval(client, { ...ticket, current_round: round }, user, effects)
  }
}

// 当前轮 pending 审批记录（无则 409）
const currentPendingRecord = async (client, ticket) => {
  const { rows } = await client.query(
    `SELECT * FROM approval_records
      WHERE ticket_id = $1 AND round = $2 AND status = 'pending' ORDER BY seq LIMIT 1`,
    [ticket.id, ticket.current_round],
  )
  if (!rows[0]) throw new ApiError(409, '当前状态不允许该操作')
  return rows[0]
}

// 节点审批权限：内置财务节点仅超管（代执行）；其余=节点审批人本人或超管兜底
const assertNodePermission = (rec, user) => {
  if (rec.assignee_role === BUILTIN_FINANCE) {
    if (user.role !== ROLES.ADMIN) throw new ApiError(403, '无权限执行该操作')
  } else if (rec.assignee_id !== user.id && user.role !== ROLES.ADMIN) {
    throw new ApiError(403, '无权限执行该操作')
  }
}

// 处理人身份：当前处理人本人或超管兜底（§0.2）
const assertHandler = (ticket, user) => {
  if (user.role !== ROLES.ADMIN && ticket.current_handler_id !== user.id) {
    throw new ApiError(403, '无权限执行该操作')
  }
}

const loadHandlerUser = async (client, handlerId) => {
  assert(Number.isInteger(handlerId), '处理人不能为空')
  const { rows } = await client.query(`SELECT id, name FROM users WHERE id = $1 AND status = '启用'`, [handlerId])
  assert(rows[0], '处理人不存在或已停用')
  return rows[0]
}

// ---------- 动作处理器（payload 校验 400；类型不适用 409） ----------

const ACTION_HANDLERS = {
  async submit(client, ticket, user, payload, beId, effects) {
    await doSubmit(client, ticket, user, { beId, version: payload.version, effects })
  },

  async approve(client, ticket, user, payload, beId, effects) {
    const rec = await currentPendingRecord(client, ticket)
    assertNodePermission(rec, user)
    const isFinance = rec.assignee_role === BUILTIN_FINANCE
    await client.query(
      `UPDATE approval_records SET status = 'approved', comment = $1, acted_at = now(), acted_by = $2, acted_as = $3
        WHERE id = $4`,
      [payload.comment ?? null, user.id, isFinance ? BUILTIN_FINANCE : null, rec.id],
    )
    await completeSlaRecords(client, {
      ticketId: ticket.id, metric: 'approval', round: ticket.current_round, nodeSeq: rec.seq, operatorId: user.id,
    })
    if (user.id !== ticket.applicant_id) {
      await completeSlaRecords(client, { ticketId: ticket.id, metric: 'first_response', operatorId: user.id })
    }
    const next = await advanceApproval(client, ticket, ticket.current_round, rec.seq + 1, user.id)
    let toStatus = STATUS.PENDING_APPROVAL
    if (next) {
      await updateTicket(client, ticket.id, payload.version, `status = 'pending_approval'`, [])
    } else {
      toStatus = await finalizeApproval(client, ticket, user, effects, payload.version)
    }
    await insertLog(client, {
      ticketId: ticket.id, action: 'approve', fromStatus: STATUS.PENDING_APPROVAL, toStatus,
      operatorId: user.id, remark: payload.comment ?? null,
      metadata: isFinance ? { proxy: BUILTIN_FINANCE } : null, beId,
    })
  },

  async reject_approval(client, ticket, user, payload, beId, effects) {
    assert(typeof payload.comment === 'string' && payload.comment.trim(), '驳回必须填写理由')
    const rec = await currentPendingRecord(client, ticket)
    assertNodePermission(rec, user)
    const isFinance = rec.assignee_role === BUILTIN_FINANCE
    await client.query(
      `UPDATE approval_records SET status = 'rejected', comment = $1, acted_at = now(), acted_by = $2, acted_as = $3
        WHERE id = $4`,
      [payload.comment.trim(), user.id, isFinance ? BUILTIN_FINANCE : null, rec.id],
    )
    await completeSlaRecords(client, {
      ticketId: ticket.id, metric: 'approval', round: ticket.current_round, nodeSeq: rec.seq, operatorId: user.id,
    })
    if (user.id !== ticket.applicant_id) {
      await completeSlaRecords(client, { ticketId: ticket.id, metric: 'first_response', operatorId: user.id })
    }
    await updateTicket(client, ticket.id, payload.version, `status = 'draft'`, []) // 驳回一律回 draft
    await insertLog(client, {
      ticketId: ticket.id, action: 'reject_approval', fromStatus: STATUS.PENDING_APPROVAL,
      toStatus: STATUS.DRAFT, operatorId: user.id, remark: payload.comment.trim(),
      metadata: isFinance ? { proxy: BUILTIN_FINANCE } : null, beId,
    })
    effects.push({
      recipients: [ticket.applicant_id], ticketId: ticket.id, kind: 'ticket_rejected',
      templateCode: 'ticket_rejected',
      vars: { title: ticket.title, id: ticket.id, reason: payload.comment.trim() },
      eventKey: `rejected:${ticket.id}:${ticket.current_round}:${rec.seq}`,
    })
  },

  async assign(client, ticket, user, payload, beId, effects) {
    if (ticket.type !== 'fault_repair') throw new ApiError(409, '当前状态不允许该操作')
    const handler = await loadHandlerUser(client, payload.handlerId)
    await updateTicket(client, ticket.id, payload.version,
      `status = 'pending_acceptance', current_handler_id = $1`, [handler.id])
    if (user.id !== ticket.applicant_id) {
      await completeSlaRecords(client, { ticketId: ticket.id, metric: 'first_response', operatorId: user.id })
    }
    await insertLog(client, {
      ticketId: ticket.id, action: 'assign', fromStatus: STATUS.PENDING_ASSIGNMENT,
      toStatus: STATUS.PENDING_ACCEPTANCE, operatorId: user.id,
      remark: `指派${handler.name}处理`, metadata: { toHandler: handler.id }, beId,
    })
    effects.push({
      recipients: [handler.id], ticketId: ticket.id, kind: 'ticket_assigned',
      templateCode: 'ticket_assigned', vars: { title: ticket.title, id: ticket.id },
      eventKey: `assigned:${ticket.id}:${handler.id}:${ticket.current_round}`,
    })
  },

  async reassign(client, ticket, user, payload, beId, effects) {
    if (ticket.type !== 'fault_repair') throw new ApiError(409, '当前状态不允许该操作')
    const handler = await loadHandlerUser(client, payload.handlerId)
    await updateTicket(client, ticket.id, payload.version,
      `current_handler_id = $1`, [handler.id])
    await insertLog(client, {
      ticketId: ticket.id, action: 'reassign', fromStatus: STATUS.PENDING_ACCEPTANCE,
      toStatus: STATUS.PENDING_ACCEPTANCE, operatorId: user.id,
      remark: `改派${handler.name}处理`,
      metadata: { fromHandler: ticket.current_handler_id, toHandler: handler.id }, beId,
    })
    effects.push({
      recipients: [handler.id], ticketId: ticket.id, kind: 'ticket_assigned',
      templateCode: 'ticket_assigned', vars: { title: ticket.title, id: ticket.id },
      eventKey: `reassigned:${ticket.id}:${handler.id}:${Date.now()}`,
    })
  },

  async accept(client, ticket, user, payload, beId) {
    assertHandler(ticket, user)
    await updateTicket(client, ticket.id, payload.version,
      `status = 'pending_processing', current_handler_id = $1`, [user.id])
    await createSlaRecord(client, { ticket, metric: 'processing', operatorId: user.id })
    await insertLog(client, {
      ticketId: ticket.id, action: 'accept', fromStatus: STATUS.PENDING_ACCEPTANCE,
      toStatus: STATUS.PENDING_PROCESSING, operatorId: user.id, beId,
    })
  },

  async transfer(client, ticket, user, payload, beId, effects) {
    const handler = await loadHandlerUser(client, payload.handlerId)
    await updateTicket(client, ticket.id, payload.version,
      `status = 'pending_acceptance', current_handler_id = $1`, [handler.id]) // 新处理人需重新接单
    await insertLog(client, {
      ticketId: ticket.id, action: 'transfer', fromStatus: ticket.status,
      toStatus: STATUS.PENDING_ACCEPTANCE, operatorId: user.id,
      remark: `转派${handler.name}处理`,
      metadata: { fromHandler: ticket.current_handler_id, toHandler: handler.id }, beId,
    })
    effects.push({
      recipients: [handler.id], ticketId: ticket.id, kind: 'ticket_assigned',
      templateCode: 'ticket_assigned', vars: { title: ticket.title, id: ticket.id },
      eventKey: `transferred:${ticket.id}:${handler.id}:${Date.now()}`,
    })
  },

  async start(client, ticket, user, payload, beId) {
    assertHandler(ticket, user)
    await updateTicket(client, ticket.id, payload.version, `status = 'processing'`, [])
    await insertLog(client, {
      ticketId: ticket.id, action: 'start', fromStatus: STATUS.PENDING_PROCESSING,
      toStatus: STATUS.PROCESSING, operatorId: user.id, beId,
    })
  },

  async resolve(client, ticket, user, payload, beId, effects) {
    if (ticket.type === 'reimbursement') throw new ApiError(409, '当前状态不允许该操作')
    assert(typeof payload.result === 'string' && payload.result.trim(), '处理结果不能为空')
    assertHandler(ticket, user)
    await completeSlaRecords(client, { ticketId: ticket.id, metric: 'processing', operatorId: user.id })
    let toStatus
    if (ticket.type === 'fault_repair') {
      toStatus = STATUS.PENDING_CONFIRMATION
      await updateTicket(client, ticket.id, payload.version, `status = 'pending_confirmation'`, [])
      await createSlaRecord(client, { ticket, metric: 'confirmation', operatorId: user.id })
      effects.push({
        recipients: [ticket.applicant_id], ticketId: ticket.id, kind: 'ticket_resolved',
        templateCode: 'ticket_resolved', vars: { title: ticket.title, id: ticket.id },
        eventKey: `resolved:${ticket.id}:${ticket.reopen_count}`,
      })
    } else {
      // 账号工单无待确认环节，直接关闭（§7.2）
      toStatus = STATUS.CLOSED
      await updateTicket(client, ticket.id, payload.version, `status = 'closed', closed_at = now()`, [])
      await completeSlaRecords(client, { ticketId: ticket.id, metric: 'overall', operatorId: user.id })
    }
    await insertLog(client, {
      ticketId: ticket.id, action: 'resolve', fromStatus: STATUS.PROCESSING,
      toStatus, operatorId: user.id, remark: payload.result.trim(), beId,
    })
  },

  async confirm(client, ticket, user, payload, beId) {
    if (ticket.type !== 'fault_repair') throw new ApiError(409, '当前状态不允许该操作')
    if (user.role !== ROLES.ADMIN && ticket.applicant_id !== user.id) {
      throw new ApiError(403, '无权限执行该操作') // 仅申请人本人/超管
    }
    await updateTicket(client, ticket.id, payload.version, `status = 'closed', closed_at = now()`, [])
    await completeSlaRecords(client, { ticketId: ticket.id, metric: 'confirmation', operatorId: user.id })
    await completeSlaRecords(client, { ticketId: ticket.id, metric: 'overall', operatorId: user.id })
    await insertLog(client, {
      ticketId: ticket.id, action: 'confirm', fromStatus: STATUS.PENDING_CONFIRMATION,
      toStatus: STATUS.CLOSED, operatorId: user.id, beId,
    })
  },

  async supplement(client, ticket, user, payload, beId) {
    if (ticket.applicant_id !== user.id) throw new ApiError(403, '无权限执行该操作') // 仅申请人
    const sets = []
    const params = []
    if (typeof payload.description === 'string' && payload.description.trim()) {
      params.push(payload.description.trim())
      sets.push(`description = COALESCE(description, '') || CASE WHEN description IS NULL OR description = '' THEN '' ELSE E'\\n' END || $${params.length}`)
    }
    if (Array.isArray(payload.attachments) && payload.attachments.length) {
      params.push(JSON.stringify(payload.attachments))
      sets.push(`attachments = attachments || $${params.length}::jsonb`)
    }
    if (payload.extra && typeof payload.extra === 'object') {
      params.push(JSON.stringify(payload.extra))
      sets.push(`extra = extra || $${params.length}::jsonb`)
    }
    assert(sets.length, '补充内容不能为空')
    await updateTicket(client, ticket.id, payload.version, sets.join(', '), params)
    await insertLog(client, {
      ticketId: ticket.id, action: 'supplement', operatorId: user.id, remark: '补充材料', beId,
    })
  },

  async suspend(client, ticket, user, payload, beId) {
    assert(typeof payload.reason === 'string' && payload.reason.trim(), '挂起必须填写原因')
    await updateTicket(client, ticket.id, payload.version, `status = 'suspended'`, [])
    await pauseSlaRecords(client, {
      ticketId: ticket.id, reason: payload.reason.trim(), operatorId: user.id, metrics: PAUSABLE_METRICS,
    })
    await insertLog(client, {
      ticketId: ticket.id, action: 'suspend', fromStatus: ticket.status, toStatus: STATUS.SUSPENDED,
      operatorId: user.id, remark: payload.reason.trim(),
      metadata: { prevStatus: ticket.status }, beId, // 挂起前状态供 resume 还原
    })
  },

  async resume(client, ticket, user, payload, beId) {
    const { rows } = await client.query(
      `SELECT metadata->>'prevStatus' AS prev FROM ticket_logs
        WHERE ticket_id = $1 AND action = 'suspend' ORDER BY id DESC LIMIT 1`,
      [ticket.id],
    )
    const prev = rows[0]?.prev
    if (!prev) throw new ApiError(409, '当前状态不允许该操作')
    await updateTicket(client, ticket.id, payload.version, `status = '${prev}'`, [])
    await resumeSlaRecords(client, { ticketId: ticket.id, operatorId: user.id, metrics: PAUSABLE_METRICS })
    await insertLog(client, {
      ticketId: ticket.id, action: 'resume', fromStatus: STATUS.SUSPENDED,
      toStatus: prev, operatorId: user.id, beId,
    })
  },

  async cancel(client, ticket, user, payload, beId) {
    // §0.2：申请人本人或超管（部长仅本人）
    if (ticket.applicant_id !== user.id && user.role !== ROLES.ADMIN) {
      throw new ApiError(403, '无权限执行该操作')
    }
    await updateTicket(client, ticket.id, payload.version, `status = 'cancelled', closed_at = now()`, [])
    // 当前轮 pending 审批记录同步取消
    await client.query(
      `UPDATE approval_records SET status = 'cancelled', acted_at = now(), acted_by = $2
        WHERE ticket_id = $1 AND round = $3 AND status = 'pending'`,
      [ticket.id, user.id, ticket.current_round],
    )
    // overall 终点含 cancelled（§5.6）→ 按完结处理；其余活跃指标终止不计考核
    await completeSlaRecords(client, { ticketId: ticket.id, metric: 'overall', operatorId: user.id })
    await cancelSlaRecords(client, { ticketId: ticket.id, reason: '工单取消', operatorId: user.id })
    await insertLog(client, {
      ticketId: ticket.id, action: 'cancel', fromStatus: ticket.status,
      toStatus: STATUS.CANCELLED, operatorId: user.id, remark: payload.reason ?? null, beId,
    })
  },

  async reopen(client, ticket, user, payload, beId) {
    assert(typeof payload.reason === 'string' && payload.reason.trim(), '重开必须填写原因')
    if (user.role === ROLES.STAFF) {
      // 员工：本人 + 限时（§0.2）；部长/超管不限时
      if (ticket.applicant_id !== user.id) throw new ApiError(403, '无权限执行该操作')
      const days = Number(await getParam('reopen_window_days', 7))
      const deadline = new Date(new Date(ticket.closed_at).getTime() + days * 24 * 60 * 60 * 1000)
      if (Date.now() > deadline.getTime()) throw new ApiError(409, '已超过重开时限')
    }
    await updateTicket(client, ticket.id, payload.version,
      `status = 'pending_processing', reopen_count = reopen_count + 1, closed_at = NULL`, [])
    // 重新进入待处理：故障/账号计 processing，报销计 payment
    await createSlaRecord(client, {
      ticket, metric: ticket.type === 'reimbursement' ? 'payment' : 'processing', operatorId: user.id,
    })
    await insertLog(client, {
      ticketId: ticket.id, action: 'reopen', fromStatus: STATUS.CLOSED,
      toStatus: STATUS.PENDING_PROCESSING, operatorId: user.id, remark: payload.reason.trim(), beId,
    })
  },

  async escalate(client, ticket, user, payload, beId, effects) {
    const level = ticket.escalated_level + 1
    await updateTicket(client, ticket.id, payload.version, `escalated_level = escalated_level + 1`, [])
    await insertLog(client, {
      ticketId: ticket.id, action: 'escalate', operatorId: user.id,
      remark: payload.reason ?? null, metadata: { level }, beId,
    })
    // 通知本部门部长 + 全部超管
    const { rows: recipients } = await client.query(
      `SELECT id FROM users WHERE status = '启用'
         AND (role = $1 OR (role = $2 AND dept = $3))`,
      [ROLES.ADMIN, ROLES.LEADER, ticket.dept],
    )
    effects.push({
      recipients: recipients.map((r) => r.id), ticketId: ticket.id, kind: 'ticket_escalated',
      templateCode: 'ticket_escalated',
      vars: { title: ticket.title, id: ticket.id, level },
      eventKey: `escalated:${ticket.id}:${level}`,
    })
  },

  async change_priority(client, ticket, user, payload, beId) {
    assert(typeof payload.priority === 'string' && payload.priority, '优先级不能为空')
    await assertDictCode('priority', payload.priority, '优先级')
    await updateTicket(client, ticket.id, payload.version, `priority = $1`, [payload.priority])
    await insertLog(client, {
      ticketId: ticket.id, action: 'change_priority', operatorId: user.id,
      metadata: { from: ticket.priority, to: payload.priority }, beId, // 日志记前后值
    })
  },

  async sla_exempt(client, ticket, user, payload, beId) {
    assert(typeof payload.reason === 'string' && payload.reason.trim(), '豁免必须填写原因')
    await updateTicket(client, ticket.id, payload.version, `sla_exempt = true`, [])
    await cancelSlaRecords(client, {
      ticketId: ticket.id, reason: `SLA 豁免：${payload.reason.trim()}`, operatorId: user.id,
    })
    await insertLog(client, {
      ticketId: ticket.id, action: 'sla_exempt', operatorId: user.id,
      remark: payload.reason.trim(), beId,
    })
  },

  async mark_paid(client, ticket, user, payload, beId) {
    if (ticket.type !== 'reimbursement') throw new ApiError(409, '当前状态不允许该操作')
    assert(typeof payload.voucherNo === 'string' && payload.voucherNo.trim(), '付款凭证号不能为空')
    assert(typeof payload.amount === 'number' && payload.amount > 0, '付款金额必须大于 0')
    // payment_records.ticket_id UNIQUE：单工单仅付款一次（幂等硬约束）
    await client.query(
      `INSERT INTO payment_records (ticket_id, voucher_no, amount, operator_id, acted_as, remark, business_event_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [ticket.id, payload.voucherNo.trim(), payload.amount, user.id, BUILTIN_FINANCE, payload.remark ?? null, beId],
    )
    await updateTicket(client, ticket.id, payload.version, `status = 'closed', closed_at = now()`, [])
    await completeSlaRecords(client, { ticketId: ticket.id, metric: 'payment', operatorId: user.id })
    await completeSlaRecords(client, { ticketId: ticket.id, metric: 'overall', operatorId: user.id })
    await insertLog(client, {
      ticketId: ticket.id, action: 'mark_paid', fromStatus: ticket.status, toStatus: STATUS.CLOSED,
      operatorId: user.id, remark: payload.remark ?? `凭证号 ${payload.voucherNo.trim()}`,
      metadata: { proxy: BUILTIN_FINANCE }, beId, // 超管代财务部执行
    })
  },
}

// ---------- 待办聚合（注意：/todo、/export 必须注册在 /:id 之前） ----------

// GET /api/tickets/todo —— 我的待办聚合（§2；待办实时聚合，不查 notifications）
router.get('/todo', async (req, res) => {
  const user = req.user
  const params = [user.id]
  // 员工基础：handler=me 活跃处理态 + 本人申请待确认单
  const handleConds = [
    `(t.current_handler_id = $1 AND t.status IN ('pending_acceptance','pending_processing','processing'))`,
    `(t.applicant_id = $1 AND t.status = 'pending_confirmation')`,
  ]
  if (user.role === ROLES.LEADER) {
    // 部长：另加本部门待分配故障单
    params.push(user.dept)
    handleConds.push(`(t.dept = $2 AND t.status = 'pending_assignment' AND t.type = 'fault_repair')`)
  }
  const { rows: handleRows } = await query(
    `SELECT t.*, a.name AS applicant_name, h.name AS handler_name
       FROM tickets t
       JOIN users a ON a.id = t.applicant_id
       LEFT JOIN users h ON h.id = t.current_handler_id
      WHERE t.deleted_at IS NULL AND (${handleConds.join(' OR ')})
      ORDER BY t.created_at DESC`,
    params,
  )
  // 待审批：当前节点审批人=我（部长 L1 / 超管 L2 均由此解析）
  const { rows: approveRows } = await query(
    `SELECT t.*, a.name AS applicant_name, h.name AS handler_name
       FROM approval_records r
       JOIN tickets t ON t.id = r.ticket_id AND t.deleted_at IS NULL
       JOIN users a ON a.id = t.applicant_id
       LEFT JOIN users h ON h.id = t.current_handler_id
      WHERE r.assignee_id = $1 AND r.status = 'pending'
      ORDER BY r.assigned_at`,
    [user.id],
  )
  const data = {
    handleList: handleRows.map(toTicketDTO),
    approveList: approveRows.map(toTicketDTO),
  }
  if (user.role === ROLES.ADMIN) {
    // 内置财务部队列仅聚合进超管待办（§3.3）
    const { rows: financeRows } = await query(
      `SELECT t.*, a.name AS applicant_name, h.name AS handler_name
         FROM approval_records r
         JOIN tickets t ON t.id = r.ticket_id AND t.deleted_at IS NULL
         JOIN users a ON a.id = t.applicant_id
         LEFT JOIN users h ON h.id = t.current_handler_id
        WHERE r.assignee_role = $1 AND r.status = 'pending'
        ORDER BY r.assigned_at`,
      [BUILTIN_FINANCE],
    )
    data.financeList = financeRows.map(toTicketDTO)
  }
  ok(res, data)
})

// GET /api/tickets/export —— 工单导出 CSV（仅超管）
router.get('/export', requireRole(ROLES.ADMIN), async (req, res) => {
  const { rows } = await listTickets(req)
  const { rows: dicts } = await query(`SELECT dict_type, code, label FROM sys_dictionaries WHERE active`)
  const labelOf = (type, code) => dicts.find((d) => d.dict_type === type && d.code === code)?.label ?? (code ?? '')
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const header = ['单号', '标题', '类型', '状态', '优先级', '故障分类', '部门', '申请人', '处理人', '创建时间', '首次提交时间', '关闭时间']
  const lines = [header.map(esc).join(',')]
  for (const r of rows) {
    lines.push([
      r.id, r.title, labelOf('ticket_type', r.type), labelOf('ticket_status', r.status),
      labelOf('priority', r.priority), labelOf('fault_category', r.fault_category),
      r.dept, r.applicant_name, r.handler_name ?? '',
      formatDateTime(r.created_at), formatDateTime(r.first_submitted_at), formatDateTime(r.closed_at),
    ].map(esc).join(','))
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="tickets-${Date.now()}.csv"`)
  res.send('﻿' + lines.join('\r\n')) // BOM 保证 Excel 中文不乱码
})

// ---------- 列表 / 详情 / 创建 / 编辑 ----------

// 列表查询（GET / 与 /export 共用）：筛选 AND 组合，范围按 §0.1
const listTickets = async (req) => {
  const { keyword, type, status, priority, dept, dateFrom, dateTo, handlerId, archived } = req.query
  if (type !== undefined) assert(TICKET_TYPES.includes(type), '工单类型不正确')
  if (status !== undefined) assert(Object.values(STATUS).includes(status), '工单状态不正确')
  if (dateFrom !== undefined) assert(isDateString(dateFrom), 'dateFrom 格式应为 YYYY-MM-DD')
  if (dateTo !== undefined) assert(isDateString(dateTo), 'dateTo 格式应为 YYYY-MM-DD')

  const params = []
  const where = ['t.deleted_at IS NULL', scopeSql(req.user, 't', params)]
  // archived 默认 false（仅看未归档）
  where.push(archived === 'true' ? 't.archived_at IS NOT NULL' : 't.archived_at IS NULL')
  if (keyword) {
    params.push(`%${keyword}%`)
    where.push(`(t.title ILIKE $${params.length} OR t.id ILIKE $${params.length})`)
  }
  if (type) { params.push(type); where.push(`t.type = $${params.length}`) }
  if (status) { params.push(status); where.push(`t.status = $${params.length}`) }
  if (priority) { params.push(priority); where.push(`t.priority = $${params.length}`) }
  if (dept) { params.push(dept); where.push(`t.dept = $${params.length}`) }
  if (handlerId) { params.push(Number(handlerId)); where.push(`t.current_handler_id = $${params.length}`) }
  if (dateFrom) { params.push(parseDate(dateFrom)); where.push(`t.created_at >= $${params.length}`) }
  if (dateTo) {
    const to = parseDate(dateTo)
    to.setDate(to.getDate() + 1) // 含当日
    params.push(to)
    where.push(`t.created_at < $${params.length}`)
  }
  const { rows } = await query(
    `SELECT t.*, a.name AS applicant_name, h.name AS handler_name
       FROM tickets t
       JOIN users a ON a.id = t.applicant_id
       LEFT JOIN users h ON h.id = t.current_handler_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.created_at DESC`,
    params,
  )
  return { rows }
}

// GET /api/tickets —— 列表（返回权限范围内全量，附带 overall SLA 记录供前端渲染倒计时）
router.get('/', async (req, res) => {
  const { rows } = await listTickets(req)
  let slaMap = new Map()
  if (rows.length) {
    const ids = rows.map((r) => r.id)
    const { rows: slaRows } = await query(
      `SELECT ticket_id, sla_status, deadline_at, is_breached FROM sla_records
        WHERE ticket_id = ANY($1) AND metric_type = 'overall'
          AND sla_status IN ('pending','running','paused','breached')`,
      [ids],
    )
    slaMap = new Map(slaRows.map((s) => [s.ticket_id, s]))
  }
  ok(res, rows.map((r) => ({ ...toTicketDTO(r), overallSla: toOverallSlaDTO(slaMap.get(r.id)) })))
})

// GET /api/tickets/:id —— 详情（含当前轮 approval_records 摘要）
router.get('/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT t.*, a.name AS applicant_name, h.name AS handler_name
       FROM tickets t
       JOIN users a ON a.id = t.applicant_id
       LEFT JOIN users h ON h.id = t.current_handler_id
      WHERE t.id = $1 AND t.deleted_at IS NULL`,
    [req.params.id],
  )
  const ticket = rows[0]
  if (!ticket || !inScope(req.user, ticket)) throw new ApiError(404, '工单不存在')
  const { rows: approvals } = await query(
    `SELECT r.*, u.name AS assignee_name, au.name AS acted_by_name
       FROM approval_records r
       LEFT JOIN users u ON u.id = r.assignee_id
       LEFT JOIN users au ON au.id = r.acted_by
      WHERE r.ticket_id = $1 AND r.round = $2
      ORDER BY r.seq`,
    [ticket.id, ticket.current_round],
  )
  ok(res, { ...toTicketDTO(ticket), approvals: approvals.map(toApprovalDTO) })
})

// POST /api/tickets —— 创建（submit=false 存草稿；true 直接走 submit 动作）
router.post('/', async (req, res) => {
  const { type, title, priority, faultCategory, description, attachments, extra, submit } = req.body || {}
  assert(TICKET_TYPES.includes(type), '工单类型不正确')
  assert(typeof title === 'string' && title.trim(), '标题不能为空')
  assert(title.trim().length <= 200, '标题不能超过 200 字')
  if (priority != null) await assertDictCode('priority', priority, '优先级')
  if (type === 'fault_repair' && faultCategory != null) {
    await assertDictCode('fault_category', faultCategory, '故障分类')
  }
  if (attachments != null) assert(Array.isArray(attachments), '附件格式不正确')
  const extraObj = extra && typeof extra === 'object' ? extra : {}
  await validateExtra(query, type, extraObj)

  const user = req.user
  const ticket = await withTx(async (client) => {
    const id = await genTicketId(client)
    const { rows } = await client.query(
      `INSERT INTO tickets (id, type, title, priority, fault_category, description, dept, applicant_id, extra, attachments)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        id, type, title.trim(), priority ?? null,
        type === 'fault_repair' ? faultCategory ?? null : null,
        description ?? null, user.dept ?? '总部', user.id,
        JSON.stringify(extraObj), JSON.stringify(attachments ?? []),
      ],
    )
    const created = { ...rows[0], applicant_role: user.role }
    if (submit === true) {
      const effects = []
      await doSubmit(client, created, user, { effects })
      for (const e of effects) notifyAsync(e.recipients, e)
    }
    return reloadTicket(client, id)
  })
  ok(res, toTicketDTO(ticket), 'ok', 201)
})

// PUT /api/tickets/:id —— 仅 draft 且申请人本人；全量替换可编辑字段（type 不可改）
router.put('/:id', async (req, res) => {
  const { title, priority, faultCategory, description, attachments, extra } = req.body || {}
  const user = req.user
  const ticket = await withTx(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM tickets WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [req.params.id])
    const t = rows[0]
    if (!t || !inScope(user, t)) throw new ApiError(404, '工单不存在')
    if (t.status !== STATUS.DRAFT) throw new ApiError(409, '当前状态不允许该操作')
    if (t.applicant_id !== user.id) throw new ApiError(403, '无权限执行该操作')

    assert(typeof title === 'string' && title.trim(), '标题不能为空')
    assert(title.trim().length <= 200, '标题不能超过 200 字')
    if (priority != null) await assertDictCode('priority', priority, '优先级')
    if (t.type === 'fault_repair' && faultCategory != null) {
      await assertDictCode('fault_category', faultCategory, '故障分类')
    }
    if (attachments != null) assert(Array.isArray(attachments), '附件格式不正确')
    const extraObj = extra && typeof extra === 'object' ? extra : {}
    await validateExtra(client, t.type, extraObj)

    await client.query(
      `UPDATE tickets SET title = $2, priority = $3, fault_category = $4, description = $5,
              extra = $6, attachments = $7, version = version + 1, updated_at = now()
        WHERE id = $1`,
      [
        t.id, title.trim(), priority ?? null,
        t.type === 'fault_repair' ? faultCategory ?? null : null,
        description ?? null, JSON.stringify(extraObj), JSON.stringify(attachments ?? []),
      ],
    )
    return reloadTicket(client, t.id)
  })
  ok(res, toTicketDTO(ticket))
})

// ---------- 统一动作网关 ----------

// POST /api/tickets/:id/actions —— { action, ...payload }
router.post('/:id/actions', async (req, res) => {
  const { action, ...payload } = req.body || {}
  assert(typeof action === 'string' && ACTIONS.includes(action), '不支持的动作')
  const user = req.user
  // 1. 角色动作权限（§0.2）→ 403
  if (!ACTION_ROLES[action]?.includes(user.role)) throw new ApiError(403, '无权限执行该操作')
  const beId = payload.business_event_id || req.headers['business_event_id'] || null

  const effects = []
  const ticket = await withTx(async (client) => {
    const { rows } = await client.query(
      `SELECT t.*, a.role AS applicant_role FROM tickets t
       JOIN users a ON a.id = t.applicant_id
      WHERE t.id = $1 AND t.deleted_at IS NULL
      FOR UPDATE OF t`,
    [req.params.id])
    const t = rows[0]
    // 2. 数据范围 → 404（不暴露存在性）
    if (!t || !inScope(user, t)) throw new ApiError(404, '工单不存在')
    // 幂等：business_event_id 重复 → 返回当前票（首次结果的状态演进版）
    if (beId) {
      const { rows: dup } = await client.query(
        'SELECT id FROM ticket_logs WHERE business_event_id = $1', [beId])
      if (dup[0]) return reloadTicket(client, t.id)
    }
    // 3. 状态机白名单 → 409
    if (!ACTION_FROM_STATUS[action]?.includes(t.status)) {
      throw new ApiError(409, '当前状态不允许该操作')
    }
    // 4. payload 校验与执行（400）
    await ACTION_HANDLERS[action](client, t, user, payload, beId, effects)
    return reloadTicket(client, t.id)
  })

  // 通知为异步副作用，不进状态事务
  for (const e of effects) notifyAsync(e.recipients, e)
  ok(res, toTicketDTO(ticket))
})

// ---------- 日志 / SLA ----------

// GET /api/tickets/:id/logs —— 时间线（代执行记录前端展示「（代财务部角色）」）
router.get('/:id/logs', async (req, res) => {
  const { rows: t } = await query('SELECT * FROM tickets WHERE id = $1 AND deleted_at IS NULL', [req.params.id])
  if (!t[0] || !inScope(req.user, t[0])) throw new ApiError(404, '工单不存在')
  const { rows } = await query(
    `SELECT l.*, u.name AS user_name
       FROM ticket_logs l LEFT JOIN users u ON u.id = l.operator_id
      WHERE l.ticket_id = $1
      ORDER BY l.created_at, l.id`,
    [req.params.id],
  )
  ok(res, rows.map(toTicketLogDTO))
})

// GET /api/tickets/:id/sla-records —— 工单 SLA 明细（前端不自行计算，时长统一返回毫秒）
router.get('/:id/sla-records', async (req, res) => {
  const { rows: t } = await query('SELECT * FROM tickets WHERE id = $1 AND deleted_at IS NULL', [req.params.id])
  if (!t[0] || !inScope(req.user, t[0])) throw new ApiError(404, '工单不存在')
  const { rows } = await query(
    `SELECT id, metric_type, sla_status, is_breached, started_at, deadline_at, ended_at,
            rule_version, target_snapshot,
            EXTRACT(EPOCH FROM target_duration)   * 1000 AS target_ms,
            EXTRACT(EPOCH FROM elapsed_duration)  * 1000 AS elapsed_ms,
            EXTRACT(EPOCH FROM breached_duration) * 1000 AS breached_ms
       FROM sla_records WHERE ticket_id = $1 ORDER BY id`,
    [req.params.id],
  )
  const calCache = new Map()
  const calCtxOf = async (id) => {
    if (!id) return null
    if (!calCache.has(id)) calCache.set(id, await loadCalendar({ query }, id))
    return calCache.get(id)
  }
  const data = []
  for (const r of rows) {
    const calCtx = await calCtxOf(r.target_snapshot?.calendarId)
    data.push({
      id: r.id,
      metricType: r.metric_type,
      slaStatus: r.sla_status,
      targetDuration: Math.round(Number(r.target_ms)),
      elapsedDuration: Math.round(currentElapsedMs(r, calCtx)),
      deadlineAt: formatDateTime(r.deadline_at),
      isBreached: r.is_breached,
      breachedDuration: Math.round(Number(r.breached_ms) || 0),
      ruleVersion: r.rule_version,
    })
  }
  ok(res, data)
})

export default router

// GET /api/sla-records —— SLA 计时监控列表（超管全部 / 部长本部门；员工 403）
export const slaRecordsRouter = Router()
slaRecordsRouter.get('/', requireAuth, requireRole(ROLES.ADMIN, ROLES.LEADER), async (req, res) => {
  const { slaStatus, metricType, ticketType } = req.query
  const params = []
  const where = ['t.deleted_at IS NULL']
  if (req.user.role === ROLES.LEADER) {
    params.push(req.user.dept)
    where.push(`t.dept = $${params.length}`)
  }
  if (slaStatus) {
    assert(['running', 'breached', 'paused'].includes(slaStatus), 'slaStatus 不正确')
    params.push(slaStatus)
    where.push(`s.sla_status = $${params.length}`)
  } else {
    where.push(`s.sla_status IN ('running','breached','paused')`)
  }
  if (metricType) { params.push(metricType); where.push(`s.metric_type = $${params.length}`) }
  if (ticketType) {
    assert(TICKET_TYPES.includes(ticketType), '工单类型不正确')
    params.push(ticketType)
    where.push(`t.type = $${params.length}`)
  }
  const { rows } = await query(
    `SELECT s.id, s.ticket_id, s.metric_type, s.sla_status, s.deadline_at, s.is_breached,
            t.title AS ticket_title, h.name AS handler_name
       FROM sla_records s
       JOIN tickets t ON t.id = s.ticket_id
       LEFT JOIN users h ON h.id = t.current_handler_id
      WHERE ${where.join(' AND ')}
      ORDER BY s.deadline_at NULLS LAST`,
    params,
  )
  ok(res, rows.map((r) => ({
    id: r.id,
    ticketId: r.ticket_id,
    ticketTitle: r.ticket_title,
    metricType: r.metric_type,
    slaStatus: r.sla_status,
    deadlineAt: formatDateTime(r.deadline_at),
    isBreached: r.is_breached,
    handlerName: r.handler_name ?? null,
  })))
})
