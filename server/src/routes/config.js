// 系统配置（api-design.md §4）：查询类接口全员可用；变更仅超管且全部写 audit_logs
import { Router } from 'express'
import { query, withTx } from '../db.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { ApiError } from '../utils/apiError.js'
import { ok } from '../utils/respond.js'
import { assert } from '../utils/validate.js'
import { writeAudit } from '../services/audit.js'
import { ROLES, TICKET_TYPES, SLA_METRICS } from '../constants.js'

const router = Router()
router.use(requireAuth)

const adminOnly = requireRole(ROLES.ADMIN)
const TARGET_UNITS = ['minute', 'work_hour', 'work_day', 'natural_day']

// ---------- 字典 ----------

// GET /api/dictionaries?dict_type= —— 全员（表单下拉用），返回 active 项
router.get('/dictionaries', async (req, res) => {
  const params = []
  let where = 'WHERE active'
  if (req.query.dict_type) {
    params.push(req.query.dict_type)
    where += ` AND dict_type = $${params.length}`
  }
  const { rows } = await query(
    `SELECT id, dict_type AS "dictType", code, label, sort, active
       FROM sys_dictionaries ${where} ORDER BY dict_type, sort, id`,
    params,
  )
  ok(res, rows)
})

// POST /api/dictionaries —— 新增字典项
router.post('/dictionaries', adminOnly, async (req, res) => {
  const { dictType, code, label, sort } = req.body || {}
  assert(typeof dictType === 'string' && dictType.trim(), 'dictType 不能为空')
  assert(typeof code === 'string' && /^[a-z0-9_]{1,30}$/.test(code), 'code 仅限小写字母/数字/下划线')
  assert(typeof label === 'string' && label.trim(), 'label 不能为空')
  const item = await withTx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO sys_dictionaries (dict_type, code, label, sort)
       VALUES ($1,$2,$3,$4) RETURNING id, dict_type AS "dictType", code, label, sort, active`,
      [dictType.trim(), code, label.trim(), Number.isInteger(sort) ? sort : 0],
    ).catch((err) => {
      if (err.code === '23505') throw new ApiError(409, '同类型下 code 已存在')
      throw err
    })
    await writeAudit(client, {
      actorId: req.user.id, targetType: 'dictionary', targetId: rows[0].id, action: 'create', after: rows[0],
    })
    return rows[0]
  })
  ok(res, item, 'ok', 201)
})

// PUT /api/dictionaries/:id —— 改 label/sort/active（code 不可改）
router.put('/dictionaries/:id', adminOnly, async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id), 'ID 不合法')
  const { label, sort, active } = req.body || {}
  assert(typeof label === 'string' && label.trim(), 'label 不能为空')
  const item = await withTx(async (client) => {
    const { rows: before } = await client.query(
      'SELECT * FROM sys_dictionaries WHERE id = $1 FOR UPDATE', [id])
    assert(before[0], '字典项不存在', 404)
    const { rows } = await client.query(
      `UPDATE sys_dictionaries SET label = $2, sort = $3, active = $4
        WHERE id = $1 RETURNING id, dict_type AS "dictType", code, label, sort, active`,
      [id, label.trim(), Number.isInteger(sort) ? sort : before[0].sort, active !== false],
    )
    await writeAudit(client, {
      actorId: req.user.id, targetType: 'dictionary', targetId: id,
      action: 'update', before: before[0], after: rows[0],
    })
    return rows[0]
  })
  ok(res, item)
})

// ---------- 审批流程定义 ----------

// GET /api/approval-flows?ticket_type=
router.get('/approval-flows', async (req, res) => {
  const params = []
  let where = ''
  if (req.query.ticket_type) {
    assert(TICKET_TYPES.includes(req.query.ticket_type), '工单类型不正确')
    params.push(req.query.ticket_type)
    where = `WHERE ticket_type = $${params.length}`
  }
  const { rows } = await query(
    `SELECT id, ticket_type AS "ticketType", seq, node_name AS "nodeName",
            approver_strategy AS "approverStrategy", skip_rule AS "skipRule", active
       FROM approval_flow_nodes ${where} ORDER BY ticket_type, seq`,
    params,
  )
  ok(res, rows)
})

// PUT /api/approval-flows/bulk —— 整组替换某工单类型的审批节点（事务：先删后插）
// 请求体：{ ticketType: 'fault_repair', nodes: [{ nodeName, approverStrategy, skipRule? }, ...] }
router.put('/approval-flows/bulk', adminOnly, async (req, res) => {
  const { ticketType, nodes } = req.body || {}
  assert(typeof ticketType === 'string' && TICKET_TYPES.includes(ticketType), '工单类型不正确')
  assert(Array.isArray(nodes), 'nodes 必须是数组')

  // 校验每个节点
  const validNodes = nodes.map((n, i) => {
    assert(typeof n.nodeName === 'string' && n.nodeName.trim(), `第 ${i + 1} 个节点名称不能为空`)
    assert(typeof n.approverStrategy === 'string', `第 ${i + 1} 个节点缺少 approverStrategy`)
    assert(n.skipRule === null || n.skipRule === undefined || typeof n.skipRule === 'object',
      `第 ${i + 1} 个节点 skipRule 格式不正确`)
    return {
      nodeName: n.nodeName.trim(),
      approverStrategy: n.approverStrategy,
      skipRule: n.skipRule || null,
    }
  })

  const result = await withTx(async (client) => {
    // 1. 删除该 ticket_type 的所有现有节点（audit_logs 记录）
    const { rows: before } = await client.query(
      'SELECT * FROM approval_flow_nodes WHERE ticket_type = $1 ORDER BY seq', [ticketType],
    )
    await client.query('DELETE FROM approval_flow_nodes WHERE ticket_type = $1', [ticketType])

    // 2. 批量插入新节点（按数组顺序给 seq）
    const rowNames = ['ticket_type', 'seq', 'node_name', 'approver_strategy', 'skip_rule']
    const values = []
    const params = [ticketType]
    for (let i = 0; i < validNodes.length; i++) {
      const n = validNodes[i]
      const offset = params.length + 1
      values.push(
        `($1, $${offset}, $${offset + 1}, $${offset + 2}, $${offset + 3})`,
      )
      params.push(i + 1, n.nodeName, n.approverStrategy, n.skipRule ? JSON.stringify(n.skipRule) : null)
    }

    let rows = []
    if (validNodes.length > 0) {
      const q = `INSERT INTO approval_flow_nodes (${rowNames.join(', ')})
                 VALUES ${values.join(', ')}
                 RETURNING id, ticket_type AS "ticketType", seq, node_name AS "nodeName",
                           approver_strategy AS "approverStrategy", skip_rule AS "skipRule", active`
      const result = await client.query(q, params)
      rows = result.rows
    }

    // 3. 写一条 audit（整组替换，只记 before 长度和 after 长度）
    await writeAudit(client, {
      actorId: req.user.id,
      targetType: 'flow_node_bulk',
      targetId: ticketType,
      action: 'replace',
      before: { count: before.length, rows: before.map(r => ({ seq: r.seq, node_name: r.node_name })) },
      after: { count: rows.length, rows: rows.map(r => ({ seq: r.seq, nodeName: r.nodeName })) },
    })

    return rows
  })

  ok(res, result)
})

// PUT /api/approval-flows/:id —— 改 node_name/skip_rule/active；seq 与 strategy 不可在线改
router.put('/approval-flows/:id', adminOnly, async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id), 'ID 不合法')
  const { nodeName, skipRule, active } = req.body || {}
  assert(typeof nodeName === 'string' && nodeName.trim(), '节点名称不能为空')
  assert(skipRule === null || skipRule === undefined || typeof skipRule === 'object', 'skipRule 格式不正确')
  const item = await withTx(async (client) => {
    const { rows: before } = await client.query(
      'SELECT * FROM approval_flow_nodes WHERE id = $1 FOR UPDATE', [id])
    assert(before[0], '审批节点不存在', 404)
    const { rows } = await client.query(
      `UPDATE approval_flow_nodes SET node_name = $2, skip_rule = $3, active = $4, updated_at = now()
        WHERE id = $1
        RETURNING id, ticket_type AS "ticketType", seq, node_name AS "nodeName",
                  approver_strategy AS "approverStrategy", skip_rule AS "skipRule", active`,
      [id, nodeName.trim(), skipRule ? JSON.stringify(skipRule) : null, active !== false],
    )
    await writeAudit(client, {
      actorId: req.user.id, targetType: 'flow_node', targetId: id,
      action: 'update', before: before[0], after: rows[0],
    })
    return rows[0]
  })
  ok(res, item)
})

// ---------- SLA 规则（版本化，只增不改） ----------

// GET /api/sla-rules?ticket_type= —— 含历史版本，含关联日历
router.get('/sla-rules', async (req, res) => {
  const params = []
  let where = ''
  if (req.query.ticket_type) {
    assert(TICKET_TYPES.includes(req.query.ticket_type), '工单类型不正确')
    params.push(req.query.ticket_type)
    where = `WHERE r.ticket_type = $${params.length}`
  }
  const { rows } = await query(
    `SELECT r.id, r.ticket_type AS "ticketType", r.metric_type AS "metricType",
            r.priority, r.node_seq AS "nodeSeq", r.target_value AS "targetValue",
            r.target_unit AS "targetUnit", r.calendar_id AS "calendarId",
            c.name AS "calendarName", r.warning_thresholds AS "warningThresholds",
            r.repeat_remind_interval::text AS "repeatRemindInterval",
            r.version, r.active
       FROM sla_rules r LEFT JOIN work_calendars c ON c.id = r.calendar_id
       ${where}
      ORDER BY r.ticket_type, r.metric_type, r.node_seq NULLS FIRST, r.priority NULLS FIRST, r.version DESC`,
    params,
  )
  ok(res, rows)
})

// POST /api/sla-rules —— 新增规则版本（历史版本不改）
router.post('/sla-rules', adminOnly, async (req, res) => {
  const { ticketType, metricType, priority, nodeSeq, targetValue, targetUnit,
          calendarId, warningThresholds, repeatRemindInterval } = req.body || {}
  assert(TICKET_TYPES.includes(ticketType), '工单类型不正确')
  assert(SLA_METRICS.includes(metricType), '指标类型不正确')
  assert(Number.isInteger(targetValue) && targetValue > 0, '目标时限必须为正整数')
  assert(TARGET_UNITS.includes(targetUnit), '目标单位不正确')
  if (nodeSeq != null) assert(Number.isInteger(nodeSeq) && nodeSeq > 0, 'nodeSeq 不合法')
  if (calendarId != null) {
    const { rows } = await query('SELECT 1 FROM work_calendars WHERE id = $1', [calendarId])
    assert(rows[0], '工作日历不存在')
  }
  if (warningThresholds != null) {
    assert(Array.isArray(warningThresholds) && warningThresholds.every((n) => Number.isInteger(n) && n > 0 && n < 100),
      'warningThresholds 应为 1-99 的整数数组')
  }
  if (repeatRemindInterval != null) assert(typeof repeatRemindInterval === 'string' && repeatRemindInterval.trim(),
    'repeatRemindInterval 应为 PG interval 文本（如 2 hours）')

  const item = await withTx(async (client) => {
    // 同组（ticket_type+metric+priority+node_seq）最高版本 +1
    const { rows: v } = await client.query(
      `SELECT COALESCE(max(version), 0) + 1 AS next FROM sla_rules
        WHERE ticket_type = $1 AND metric_type = $2
          AND priority IS NOT DISTINCT FROM $3 AND node_seq IS NOT DISTINCT FROM $4`,
      [ticketType, metricType, priority ?? null, nodeSeq ?? null],
    )
    const { rows } = await client.query(
      `INSERT INTO sla_rules (ticket_type, metric_type, priority, node_seq, target_value, target_unit,
                              calendar_id, warning_thresholds, repeat_remind_interval, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, ticket_type AS "ticketType", metric_type AS "metricType", priority,
                 node_seq AS "nodeSeq", target_value AS "targetValue", target_unit AS "targetUnit",
                 calendar_id AS "calendarId", warning_thresholds AS "warningThresholds",
                 repeat_remind_interval::text AS "repeatRemindInterval", version, active`,
      [ticketType, metricType, priority ?? null, nodeSeq ?? null, targetValue, targetUnit,
       calendarId ?? null, JSON.stringify(warningThresholds ?? [50, 75, 90]),
       repeatRemindInterval ?? null, v[0].next],
    )
    await writeAudit(client, {
      actorId: req.user.id, targetType: 'sla_rule', targetId: rows[0].id, action: 'create', after: rows[0],
    })
    return rows[0]
  })
  ok(res, item, 'ok', 201)
})

// PATCH /api/sla-rules/:id —— active 启停（版本内容不可改）
router.patch('/sla-rules/:id', adminOnly, async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id), 'ID 不合法')
  const { active } = req.body || {}
  assert(typeof active === 'boolean', 'active 必须为布尔值')
  const item = await withTx(async (client) => {
    const { rows: before } = await client.query('SELECT * FROM sla_rules WHERE id = $1 FOR UPDATE', [id])
    assert(before[0], 'SLA 规则不存在', 404)
    const { rows } = await client.query(
      `UPDATE sla_rules SET active = $2, updated_at = now() WHERE id = $1
       RETURNING id, ticket_type AS "ticketType", metric_type AS "metricType", priority,
                 node_seq AS "nodeSeq", target_value AS "targetValue", target_unit AS "targetUnit",
                 calendar_id AS "calendarId", warning_thresholds AS "warningThresholds",
                 repeat_remind_interval::text AS "repeatRemindInterval", version, active`,
      [id, active],
    )
    await writeAudit(client, {
      actorId: req.user.id, targetType: 'sla_rule', targetId: id,
      action: 'update_active', before: { active: before[0].active }, after: { active },
    })
    return rows[0]
  })
  ok(res, item)
})

// ---------- SLA 事件日志（全局查询，adminOnly）----------
// GET /api/sla-events?ticket_id=&event_type=&sla_status=&limit=50&offset=0
router.get('/sla-events', adminOnly, async (req, res) => {
  const params = []
  const where = []
  if (req.query.ticket_id) { params.push(req.query.ticket_id); where.push(`e.ticket_id = $${params.length}`) }
  if (req.query.event_type) { params.push(req.query.event_type); where.push(`e.event_type = $${params.length}`) }
  if (req.query.sla_status) { params.push(req.query.sla_status); where.push(`s.sla_status = $${params.length}`) }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const limit = Math.min(parseInt(req.query.limit) || 50, 200)
  const offset = parseInt(req.query.offset) || 0

  const countSql = `SELECT count(*) FROM sla_events e LEFT JOIN sla_records s ON s.id = e.sla_id ${whereSql}`
  const { rows: c } = await query(countSql, params)

  const sql = `SELECT e.id, e.ticket_id AS "ticketId", e.sla_id AS "slaId", e.event_type AS "eventType",
                     e.from_status AS "fromStatus", e.to_status AS "toStatus",
                     e.event_time AS "eventTime", e.operator_id AS "operatorId",
                     e.trigger_source AS "triggerSource", e.elapsed_duration::text AS "elapsedDuration",
                     e.remaining_duration::text AS "remainingDuration", e.reason,
                     s.metric_type AS "metricType", s.sla_status AS "slaStatus", s.is_breached AS "isBreached"
                FROM sla_events e LEFT JOIN sla_records s ON s.id = e.sla_id
                ${whereSql}
                ORDER BY e.event_time DESC, e.id DESC
                LIMIT ${limit} OFFSET ${offset}`
  const { rows } = await query(sql, params)
  ok(res, { total: parseInt(c[0].count), list: rows, page: Math.floor(offset / limit) + 1, pageSize: limit })
})

// ---------- 工作日历 ----------

// GET /api/work-calendars —— 含 special_days
router.get('/work-calendars', async (req, res) => {
  const { rows: cals } = await query(
    `SELECT id, name, work_days AS "workDays", day_start::text AS "dayStart", day_end::text AS "dayEnd",
            breaks, timezone, active FROM work_calendars ORDER BY id`)
  const { rows: days } = await query(
    `SELECT calendar_id AS "calendarId", day::text AS day, kind, name
       FROM calendar_special_days ORDER BY day`)
  ok(res, cals.map((c) => ({ ...c, specialDays: days.filter((d) => d.calendarId === c.id) })))
})

// PUT /api/work-calendars/:id —— 维护日历与 special_days（整组替换）
router.put('/work-calendars/:id', adminOnly, async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id), 'ID 不合法')
  const { name, workDays, dayStart, dayEnd, breaks, active, specialDays } = req.body || {}
  assert(typeof name === 'string' && name.trim(), '日历名称不能为空')
  assert(Array.isArray(workDays) && workDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    'workDays 应为 0-6 的整数数组')
  assert(/^\d{2}:\d{2}$/.test(dayStart) && /^\d{2}:\d{2}$/.test(dayEnd), '工作时间格式应为 HH:mm')
  assert(Array.isArray(breaks), 'breaks 应为数组')
  assert(Array.isArray(specialDays), 'specialDays 应为数组')
  for (const d of specialDays) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(d?.day), 'specialDays.day 格式应为 YYYY-MM-DD')
    assert(['holiday', 'extra_workday'].includes(d?.kind), 'specialDays.kind 仅支持 holiday/extra_workday')
  }
  const item = await withTx(async (client) => {
    const { rows: before } = await client.query('SELECT * FROM work_calendars WHERE id = $1 FOR UPDATE', [id])
    assert(before[0], '工作日历不存在', 404)
    const { rows: beforeDays } = await client.query(
      'SELECT day::text AS day, kind, name FROM calendar_special_days WHERE calendar_id = $1', [id])
    const { rows } = await client.query(
      `UPDATE work_calendars SET name = $2, work_days = $3, day_start = $4, day_end = $5, breaks = $6, active = $7
        WHERE id = $1
        RETURNING id, name, work_days AS "workDays", day_start::text AS "dayStart",
                  day_end::text AS "dayEnd", breaks, timezone, active`,
      [id, name.trim(), workDays, dayStart, dayEnd, JSON.stringify(breaks), active !== false],
    )
    await client.query('DELETE FROM calendar_special_days WHERE calendar_id = $1', [id])
    for (const d of specialDays) {
      await client.query(
        'INSERT INTO calendar_special_days (calendar_id, day, kind, name) VALUES ($1,$2,$3,$4)',
        [id, d.day, d.kind, d.name ?? null],
      )
    }
    await writeAudit(client, {
      actorId: req.user.id, targetType: 'system_param', targetId: `work_calendar:${id}`,
      action: 'update', before: { ...before[0], specialDays: beforeDays }, after: { ...rows[0], specialDays },
    })
    return rows[0]
  })
  ok(res, { ...item, specialDays })
})

// ---------- 自定义表单字段 ----------

// GET /api/form-configs?ticket_type= —— 全员（渲染提交表单）
router.get('/form-configs', async (req, res) => {
  const params = []
  let where = ''
  if (req.query.ticket_type) {
    assert(TICKET_TYPES.includes(req.query.ticket_type), '工单类型不正确')
    params.push(req.query.ticket_type)
    where = `WHERE ticket_type = $${params.length}`
  }
  const { rows } = await query(
    `SELECT id, ticket_type AS "ticketType", field_key AS "fieldKey", label,
            field_type AS "fieldType", required, options, sort, active
       FROM form_field_configs ${where} ORDER BY ticket_type, sort, id`,
    params,
  )
  ok(res, rows)
})

const FIELD_TYPES = ['text', 'textarea', 'number', 'select', 'date']

// POST /api/form-configs —— 新增自定义字段
router.post('/form-configs', adminOnly, async (req, res) => {
  const { ticketType, fieldKey, label, fieldType, required, options, sort } = req.body || {}
  assert(TICKET_TYPES.includes(ticketType), '工单类型不正确')
  assert(typeof fieldKey === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(fieldKey), 'fieldKey 应以字母开头，仅限字母/数字/下划线')
  assert(typeof label === 'string' && label.trim(), 'label 不能为空')
  assert(FIELD_TYPES.includes(fieldType), 'fieldType 不正确')
  if (fieldType === 'select') assert(Array.isArray(options) && options.length, 'select 必须提供 options')
  const item = await withTx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO form_field_configs (ticket_type, field_key, label, field_type, required, options, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, ticket_type AS "ticketType", field_key AS "fieldKey", label,
                 field_type AS "fieldType", required, options, sort, active`,
      [ticketType, fieldKey, label.trim(), fieldType, required === true,
       options ? JSON.stringify(options) : null, Number.isInteger(sort) ? sort : 0],
    ).catch((err) => {
      if (err.code === '23505') throw new ApiError(409, '该类型下 fieldKey 已存在')
      throw err
    })
    await writeAudit(client, {
      actorId: req.user.id, targetType: 'form_field', targetId: rows[0].id, action: 'create', after: rows[0],
    })
    return rows[0]
  })
  ok(res, item, 'ok', 201)
})

// PUT /api/form-configs/:id —— 改字段（不可物理删，active=false 下线）
router.put('/form-configs/:id', adminOnly, async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id), 'ID 不合法')
  const { label, fieldType, required, options, sort, active } = req.body || {}
  assert(typeof label === 'string' && label.trim(), 'label 不能为空')
  assert(FIELD_TYPES.includes(fieldType), 'fieldType 不正确')
  if (fieldType === 'select') assert(Array.isArray(options) && options.length, 'select 必须提供 options')
  const item = await withTx(async (client) => {
    const { rows: before } = await client.query('SELECT * FROM form_field_configs WHERE id = $1 FOR UPDATE', [id])
    assert(before[0], '字段不存在', 404)
    const { rows } = await client.query(
      `UPDATE form_field_configs SET label = $2, field_type = $3, required = $4, options = $5, sort = $6, active = $7
        WHERE id = $1
        RETURNING id, ticket_type AS "ticketType", field_key AS "fieldKey", label,
                  field_type AS "fieldType", required, options, sort, active`,
      [id, label.trim(), fieldType, required === true, options ? JSON.stringify(options) : null,
       Number.isInteger(sort) ? sort : before[0].sort, active !== false],
    )
    await writeAudit(client, {
      actorId: req.user.id, targetType: 'form_field', targetId: id,
      action: 'update', before: before[0], after: rows[0],
    })
    return rows[0]
  })
  ok(res, item)
})

// ---------- 角色-权限码矩阵 ----------

// GET /api/role-permissions —— 全员（§10.1：前端显隐数据，缓存使用）
router.get('/role-permissions', async (req, res) => {
  const { rows } = await query(
    'SELECT role, perm_code AS "permCode" FROM role_permissions ORDER BY role, perm_code')
  ok(res, rows)
})

// PUT /api/role-permissions —— 整组更新 { permissions: [{ role, permCode }] }
router.put('/role-permissions', adminOnly, async (req, res) => {
  const { permissions } = req.body || {}
  assert(Array.isArray(permissions), 'permissions 应为数组')
  for (const p of permissions) {
    assert(typeof p?.role === 'string' && p.role.trim(), 'role 不能为空')
    assert(typeof p?.permCode === 'string' && p.permCode.trim(), 'permCode 不能为空')
  }
  await withTx(async (client) => {
    const { rows: before } = await client.query('SELECT role, perm_code FROM role_permissions ORDER BY role, perm_code')
    await client.query('DELETE FROM role_permissions')
    for (const p of permissions) {
      await client.query(
        'INSERT INTO role_permissions (role, perm_code) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [p.role.trim(), p.permCode.trim()],
      )
    }
    await writeAudit(client, {
      actorId: req.user.id, targetType: 'role_permission', targetId: 'all',
      action: 'replace', before, after: permissions,
    })
  })
  const { rows } = await query(
    'SELECT role, perm_code AS "permCode" FROM role_permissions ORDER BY role, perm_code')
  ok(res, rows)
})

// ---------- 站内通知模板 ----------

// GET /api/notification-templates
router.get('/notification-templates', async (req, res) => {
  const { rows } = await query(
    'SELECT id, code, title, content, active FROM notification_templates ORDER BY id')
  ok(res, rows)
})

// PUT /api/notification-templates/:id
router.put('/notification-templates/:id', adminOnly, async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id), 'ID 不合法')
  const { title, content, active } = req.body || {}
  assert(typeof title === 'string' && title.trim(), '标题不能为空')
  assert(typeof content === 'string' && content.trim(), '内容不能为空')
  const item = await withTx(async (client) => {
    const { rows: before } = await client.query('SELECT * FROM notification_templates WHERE id = $1 FOR UPDATE', [id])
    assert(before[0], '模板不存在', 404)
    const { rows } = await client.query(
      `UPDATE notification_templates SET title = $2, content = $3, active = $4, updated_at = now()
        WHERE id = $1 RETURNING id, code, title, content, active`,
      [id, title.trim(), content.trim(), active !== false],
    )
    await writeAudit(client, {
      actorId: req.user.id, targetType: 'system_param', targetId: `notification_template:${id}`,
      action: 'update', before: before[0], after: rows[0],
    })
    return rows[0]
  })
  ok(res, item)
})

// ---------- 系统参数 ----------

// GET /api/system-params
router.get('/system-params', async (req, res) => {
  const { rows } = await query(
    'SELECT key, value, description, updated_at AS "updatedAt" FROM system_params ORDER BY key')
  ok(res, rows)
})

// PUT /api/system-params/:key —— { value }
router.put('/system-params/:key', adminOnly, async (req, res) => {
  const key = req.params.key
  const { value } = req.body || {}
  assert(value !== undefined, 'value 不能为空')
  await withTx(async (client) => {
    const { rows: before } = await client.query('SELECT * FROM system_params WHERE key = $1 FOR UPDATE', [key])
    assert(before[0], '参数不存在', 404)
    await client.query(
      'UPDATE system_params SET value = $2, updated_at = now(), updated_by = $3 WHERE key = $1',
      [key, JSON.stringify(value), req.user.id],
    )
    await writeAudit(client, {
      actorId: req.user.id, targetType: 'system_param', targetId: key,
      action: 'update', before: before[0].value, after: value,
    })
  })
  const { rows } = await query(
    'SELECT key, value, description, updated_at AS "updatedAt" FROM system_params WHERE key = $1', [key])
  ok(res, rows[0])
})

export default router
