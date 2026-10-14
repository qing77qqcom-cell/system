import { Router } from 'express'
import { query, withTx } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { ApiError } from '../utils/apiError.js'
import { ok } from '../utils/respond.js'
import { toOrderDTO, toLogDTO } from '../utils/dto.js'
import { assert, isDateString, isDateTimeString } from '../utils/validate.js'
import { genOrderId } from '../utils/orderId.js'
import { DEPT_OPTIONS, TYPE_OPTIONS, PRIORITY_OPTIONS } from '../constants.js'

const router = Router()

// 所有工单接口均需登录
router.use(requireAuth)

// 联表查询片段：submitter/handler 内联姓名
const ORDER_SELECT = `
  SELECT o.*, s.name AS submitter_name, h.name AS handler_name
    FROM orders o
    LEFT JOIN users s ON s.id = o.submitter_id
    LEFT JOIN users h ON h.id = o.handler_id`

// §1.2-4 数据权限：不可见一律 404（不暴露存在性）
// 超级管理员=全部；部长=本部门；普通员工=本人提交的 + 被分配处理的
const visibleCond = (user, params) => {
  if (user.role === '超级管理员') return 'TRUE'
  if (user.role === '部长') {
    params.push(user.dept)
    return `o.dept = $${params.length}`
  }
  params.push(user.id)
  return `(o.submitter_id = $${params.length} OR o.handler_id = $${params.length})`
}

// 按 id 取一条"对当前用户可见"的工单，不可见/不存在/已删除 → 404
const getOrderRow = async (id, user) => {
  const params = [id]
  const { rows } = await query(
    `${ORDER_SELECT} WHERE o.id = $1 AND o.deleted_at IS NULL AND ${visibleCond(user, params)}`,
    params,
  )
  assert(rows[0], '工单不存在或无权查看', 404)
  return rows[0]
}

const getLogs = (orderId) =>
  query(
    `SELECT l.action, l.remark, l.created_at, u.name AS user_name
       FROM order_logs l LEFT JOIN users u ON u.id = l.user_id
      WHERE l.order_id = $1
      ORDER BY l.created_at ASC, l.id ASC`,
    [orderId],
  )

// 详情统一返回：Order + logs（与前端 WorkOrderDetail 消费结构一致）
const getOrderWithLogs = async (id) => {
  const row = (await query(`${ORDER_SELECT} WHERE o.id = $1`, [id])).rows[0]
  const { rows: logs } = await getLogs(id)
  return { ...toOrderDTO(row), logs: logs.map(toLogDTO) }
}

// 创建/编辑共用校验（与前端 WorkOrderForm rules 对齐）
const validateOrderBody = (body) => {
  const title = String(body.title ?? '').trim()
  assert(title, '工单标题不能为空')
  assert(title.length <= 30, '标题不能超过 30 个字')
  assert(DEPT_OPTIONS.includes(body.dept), '所属部门不合法')
  assert(TYPE_OPTIONS.includes(body.type), '问题类型不合法')
  assert(PRIORITY_OPTIONS.includes(body.priority), '优先级不合法')

  const deadline = body.deadline ?? null
  if (deadline !== null) assert(isDateTimeString(deadline), '截止时间格式应为 YYYY-MM-DD HH:mm')

  const description = String(body.description ?? '').trim()
  assert(description.length >= 5, '问题描述不少于 5 个字')

  const rawExtra = body.extra ?? {}
  assert(rawExtra && typeof rawExtra === 'object' && !Array.isArray(rawExtra), 'extra 不合法')
  const extra = { ...rawExtra }
  // 动态扩展字段必填规则与前端一致
  if (body.type === '账号权限') {
    assert(
      typeof extra.account === 'string' && /^[a-zA-Z0-9_.@-]+$/.test(extra.account),
      '账号权限类型必须填写合法账号（仅字母数字及 _ . @ -）',
    )
    assert(extra.permType, '账号权限类型必须选择权限类型')
  }
  if (body.type === '设备故障') {
    assert(String(extra.deviceNo ?? '').trim(), '设备故障类型必须填写设备编号')
    assert(extra.deviceType, '设备故障类型必须选择设备类型')
  }

  const attachments = (Array.isArray(body.attachments) ? body.attachments : [])
    .filter((a) => a && typeof a.name === 'string' && typeof a.url === 'string')
    .map((a) => ({ name: a.name.slice(0, 100), url: a.url.slice(0, 200) }))

  return { title, dept: body.dept, type: body.type, priority: body.priority, deadline, description, extra, attachments }
}

// ============ GET /api/orders — 列表（筛选 + 角色数据范围，无分页） ============
router.get('/', async (req, res) => {
  const params = []
  const conds = ['o.deleted_at IS NULL', visibleCond(req.user, params)]

  const { keyword, dept, type, status, priority, dateFrom, dateTo } = req.query
  if (keyword) {
    const kw = `%${String(keyword).trim()}%`
    params.push(kw, kw)
    conds.push(`(o.title ILIKE $${params.length - 1} OR o.id ILIKE $${params.length})`)
  }
  if (dept) {
    params.push(String(dept))
    conds.push(`o.dept = $${params.length}`)
  }
  if (type) {
    params.push(String(type))
    conds.push(`o.type = $${params.length}`)
  }
  if (status) {
    params.push(String(status))
    conds.push(`o.status = $${params.length}`)
  }
  if (priority) {
    params.push(String(priority))
    conds.push(`o.priority = $${params.length}`)
  }
  if (dateFrom) {
    assert(isDateString(String(dateFrom)), 'dateFrom 格式应为 YYYY-MM-DD')
    params.push(String(dateFrom))
    conds.push(`o.created_at >= $${params.length}::date`)
  }
  if (dateTo) {
    assert(isDateString(String(dateTo)), 'dateTo 格式应为 YYYY-MM-DD')
    params.push(String(dateTo))
    conds.push(`o.created_at < ($${params.length}::date + INTERVAL '1 day')`)
  }

  const { rows } = await query(
    `${ORDER_SELECT} WHERE ${conds.join(' AND ')} ORDER BY o.created_at DESC`,
    params,
  )
  ok(res, rows.map(toOrderDTO))
})

// ============ POST /api/orders/batch-close — 批量关闭（先于 /:id 注册） ============
router.post('/batch-close', async (req, res) => {
  if (req.user.role === '普通员工') throw new ApiError(403, '没有权限执行此操作')
  const ids = req.body?.ids
  assert(Array.isArray(ids) && ids.length >= 1 && ids.length <= 100, 'ids 必须为 1-100 个工单号组成的数组')
  assert(ids.every((i) => typeof i === 'string' && i.trim()), '工单号格式不正确')

  // 仅关闭"可见且状态允许"的工单，返回实际关闭数（与前端提示文案一致）
  const params = [ids]
  const scope = visibleCond(req.user, params)
  const { rows } = await query(
    `SELECT o.id FROM orders o
      WHERE o.id = ANY($1::varchar[]) AND o.deleted_at IS NULL
        AND o.status IN ('待处理', '处理中') AND ${scope}`,
    params,
  )
  const closable = rows.map((r) => r.id)
  if (closable.length) {
    await withTx(async (client) => {
      await client.query(
        `UPDATE orders SET status = '已关闭', updated_at = now() WHERE id = ANY($1::varchar[])`,
        [closable],
      )
      await client.query(
        `INSERT INTO order_logs (order_id, user_id, action)
         SELECT x, $2, '批量关闭工单' FROM UNNEST($1::varchar[]) AS t(x)`,
        [closable, req.user.id],
      )
    })
  }
  ok(res, { count: closable.length })
})

// ============ POST /api/orders — 创建（随机工单号，冲突重试 5 次） ============
router.post('/', async (req, res) => {
  const data = validateOrderBody(req.body || {})
  const user = req.user

  const newId = await withTx(async (client) => {
    let id
    for (let attempt = 1; attempt <= 5; attempt++) {
      id = genOrderId()
      try {
        await client.query(
          `INSERT INTO orders (id, title, type, dept, priority, status, submitter_id, deadline, description, extra, attachments)
           VALUES ($1, $2, $3, $4, $5, '待处理', $6, $7, $8, $9::jsonb, $10::jsonb)`,
          [
            id, data.title, data.type, data.dept, data.priority, user.id,
            data.deadline, data.description, JSON.stringify(data.extra), JSON.stringify(data.attachments),
          ],
        )
        break
      } catch (err) {
        if (err.code === '23505' && attempt < 5) continue // 工单号冲突，重试
        throw err
      }
    }
    await client.query(
      `INSERT INTO order_logs (order_id, user_id, action) VALUES ($1, $2, '提交工单')`,
      [id, user.id],
    )
    return id
  })
  ok(res, await getOrderWithLogs(newId), 'ok', 201)
})

// ============ GET /api/orders/:id — 详情 ============
router.get('/:id', async (req, res) => {
  const row = await getOrderRow(req.params.id, req.user)
  ok(res, await getOrderWithLogs(row.id))
})

// ============ PUT /api/orders/:id — 编辑（提交人本人 / 部长本部门 / 超管） ============
router.put('/:id', async (req, res) => {
  const row = await getOrderRow(req.params.id, req.user)
  const isSubmitter = req.user.id === row.submitter_id
  // 部长可见即本部门；普通员工仅限本人提交的
  if (!isSubmitter && req.user.role === '普通员工') {
    throw new ApiError(403, '没有权限编辑该工单')
  }
  // 含"已退回"：对应前端"根据退回原因修改后重新提交"的流程，避免死状态
  if (!['待处理', '处理中', '已退回'].includes(row.status)) {
    throw new ApiError(409, `当前状态「${row.status}」不允许编辑`)
  }
  const data = validateOrderBody(req.body || {})

  await withTx(async (client) => {
    await client.query(
      `UPDATE orders
          SET title = $2, type = $3, dept = $4, priority = $5, deadline = $6,
              description = $7, extra = $8::jsonb, attachments = $9::jsonb, updated_at = now()
        WHERE id = $1`,
      [
        row.id, data.title, data.type, data.dept, data.priority,
        data.deadline, data.description, JSON.stringify(data.extra), JSON.stringify(data.attachments),
      ],
    )
    await client.query(
      `INSERT INTO order_logs (order_id, user_id, action) VALUES ($1, $2, '编辑工单')`,
      [row.id, req.user.id],
    )
  })
  ok(res, await getOrderWithLogs(row.id))
})

// ============ PATCH /api/orders/:id/status — 状态机流转 ============
// 说明：accept 额外允许"已退回"→"处理中"，形成退回-重提闭环（规格未定义，已在报告中标注）
const STATUS_ACTIONS = {
  accept: { from: ['待处理', '已退回'], to: '处理中', log: '已接单' },
  reject: { from: ['待处理', '处理中'], to: '已退回', log: '退回工单' },
  complete: { from: ['待处理', '处理中'], to: '已完成', log: '完成工单' },
  close: { from: ['已完成'], to: '已关闭', log: '关闭工单' },
}

router.patch('/:id/status', async (req, res) => {
  const { action, reason } = req.body || {}
  const spec = STATUS_ACTIONS[action]
  assert(spec, 'action 不合法（accept / reject / complete / close）')
  // 状态流转为处理侧能力：部长/超管（普通员工 403）
  if (req.user.role === '普通员工') throw new ApiError(403, '没有权限执行此操作')

  const row = await getOrderRow(req.params.id, req.user) // 部长可见即本部门
  if (!spec.from.includes(row.status)) {
    throw new ApiError(409, `当前状态「${row.status}」不允许该操作`)
  }
  let remark = ''
  if (action === 'reject') {
    remark = String(reason ?? '').trim()
    assert(remark, '请填写退回原因')
  }

  await withTx(async (client) => {
    if (action === 'accept') {
      await client.query(
        `UPDATE orders SET status = $2, handler_id = $3, updated_at = now() WHERE id = $1`,
        [row.id, spec.to, req.user.id],
      )
    } else if (action === 'complete') {
      await client.query(
        `UPDATE orders SET status = $2, completed_at = now(), updated_at = now() WHERE id = $1`,
        [row.id, spec.to],
      )
    } else {
      await client.query(
        `UPDATE orders SET status = $2, updated_at = now() WHERE id = $1`,
        [row.id, spec.to],
      )
    }
    await client.query(
      `INSERT INTO order_logs (order_id, user_id, action, remark) VALUES ($1, $2, $3, $4)`,
      [row.id, req.user.id, spec.log, remark],
    )
  })
  ok(res, await getOrderWithLogs(row.id))
})

// ============ PATCH /api/orders/:id/assign — 分配工单（§0.1 决策 2 新增） ============
router.patch('/:id/assign', async (req, res) => {
  const handlerId = req.body?.handlerId
  assert(Number.isInteger(handlerId), 'handlerId 必须为用户 ID（整数）')
  if (req.user.role === '普通员工') throw new ApiError(403, '没有权限执行此操作')

  const row = await getOrderRow(req.params.id, req.user) // 部长可见即本部门
  if (!['待处理', '已退回'].includes(row.status)) {
    throw new ApiError(409, `当前状态「${row.status}」不允许分配`)
  }
  const { rows: h } = await query('SELECT id, name, status FROM users WHERE id = $1', [handlerId])
  assert(h[0], '处理人不存在', 400)
  assert(h[0].status === '启用', '该账号已被禁用，不能指派为处理人', 400)

  await withTx(async (client) => {
    await client.query(
      `UPDATE orders SET handler_id = $2, updated_at = now() WHERE id = $1`,
      [row.id, handlerId],
    )
    await client.query(
      `INSERT INTO order_logs (order_id, user_id, action, remark) VALUES ($1, $2, '分配工单', $3)`,
      [row.id, req.user.id, `分配给 ${h[0].name}`],
    )
  })
  ok(res, await getOrderWithLogs(row.id))
})

// ============ POST /api/orders/:id/urge — 催办（提交人本人 / 部长 / 超管） ============
router.post('/:id/urge', async (req, res) => {
  const row = await getOrderRow(req.params.id, req.user)
  if (req.user.id !== row.submitter_id && req.user.role === '普通员工') {
    throw new ApiError(403, '只有提交人可以催办该工单')
  }
  if (!['待处理', '处理中'].includes(row.status)) {
    throw new ApiError(409, `当前状态「${row.status}」不允许催办`)
  }
  await withTx(async (client) => {
    await client.query(
      `INSERT INTO order_logs (order_id, user_id, action, remark) VALUES ($1, $2, '催办', $3)`,
      [row.id, req.user.id, '请尽快处理该工单，谢谢！'],
    )
  })
  ok(res, await getOrderWithLogs(row.id))
})

// ============ DELETE /api/orders/:id — 软删除（仅超管） ============
router.delete('/:id', async (req, res) => {
  if (req.user.role !== '超级管理员') throw new ApiError(403, '只有超级管理员可以删除工单')
  const row = await getOrderRow(req.params.id, req.user)
  await query(`UPDATE orders SET deleted_at = now(), updated_at = now() WHERE id = $1`, [row.id])
  ok(res, { id: row.id })
})

export default router
