import { Router } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { ApiError } from '../utils/apiError.js'
import { ok } from '../utils/respond.js'
import { assert } from '../utils/validate.js'

const router = Router()
router.use(requireAuth)

// §5 通用口径：按角色限定范围（超管全部 / 部长本部门 / 员工本人提交的+被分配的），软删除不计入
const scopeCond = (user, params) => {
  if (user.role === '超级管理员') return 'TRUE'
  if (user.role === '部长') {
    params.push(user.dept)
    return `o.dept = $${params.length}`
  }
  params.push(user.id)
  return `(o.submitter_id = $${params.length} OR o.handler_id = $${params.length})`
}

// ============ GET /api/stats/overview — 首页指标 + 状态分布 ============
router.get('/overview', async (req, res) => {
  const params = []
  const scope = scopeCond(req.user, params)
  const { submitterId, handlerId } = req.query
  const extraConds = []
  if (submitterId) {
    assert(Number.isInteger(Number(submitterId)), 'submitterId 不合法')
    params.push(Number(submitterId))
    extraConds.push(`o.submitter_id = $${params.length}`)
  }
  if (handlerId) {
    assert(Number.isInteger(Number(handlerId)), 'handlerId 不合法')
    params.push(Number(handlerId))
    extraConds.push(`o.handler_id = $${params.length}`)
  }
  const where = extraConds.length ? `${scope} AND ${extraConds.join(' AND ')}` : scope
  const { rows } = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE o.status = '待处理')::int AS pending,
       COUNT(*) FILTER (WHERE o.status = '处理中')::int AS processing,
       COUNT(*) FILTER (WHERE o.status = '已完成')::int AS completed,
       COUNT(*) FILTER (WHERE o.status = '已关闭')::int AS closed,
       COUNT(*) FILTER (WHERE o.status = '已退回')::int AS returned,
       COUNT(*) FILTER (WHERE o.deadline IS NOT NULL
                          AND o.deadline < now()
                          AND o.status IN ('待处理', '处理中'))::int AS overdue,
       COUNT(*) FILTER (WHERE o.status = '已完成'
                          AND o.completed_at >= date_trunc('month', now()))::int AS "monthDone",
       COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (o.completed_at - o.created_at))) / 3600.0, 1), 0)::float AS "avgProcessHours"
     FROM orders o
     WHERE o.deleted_at IS NULL AND ${where}`,
    params,
  )
  ok(res, rows[0])
})

// ============ GET /api/stats/trend?days=7 — 工单趋势（逐日补零） ============
router.get('/trend', async (req, res) => {
  const days = Number(req.query.days) || 7
  assert([7, 30].includes(days), 'days 仅支持 7 或 30')
  const params = [days]
  const scope = scopeCond(req.user, params)
  const { rows } = await query(
    `WITH series AS (
       SELECT generate_series(current_date - ($1::int - 1), current_date, INTERVAL '1 day')::date AS d
     ),
     scoped AS (
       SELECT o.created_at, o.completed_at FROM orders o WHERE o.deleted_at IS NULL AND ${scope}
     )
     SELECT to_char(series.d, 'YYYY-MM-DD') AS date,
            (SELECT COUNT(*)::int FROM scoped s WHERE s.created_at::date = series.d) AS created,
            (SELECT COUNT(*)::int FROM scoped s WHERE s.completed_at::date = series.d) AS completed
     FROM series
     ORDER BY series.d ASC`,
    params,
  )
  ok(res, rows)
})

// ============ GET /api/stats/workload — 处理人工作量（部长/超管） ============
router.get('/workload', async (req, res) => {
  if (req.user.role === '普通员工') throw new ApiError(403, '没有权限执行此操作')
  const params = []
  const scope = scopeCond(req.user, params)
  const { rows } = await query(
    `SELECT u.id AS "handlerId", u.name AS "handlerName",
       COUNT(*) FILTER (WHERE o.status = '处理中')::int AS processing,
       COUNT(*) FILTER (WHERE o.status = '已完成')::int AS completed,
       COALESCE(
         ROUND(AVG(CASE WHEN o.completed_at IS NOT NULL
                        THEN EXTRACT(EPOCH FROM (o.completed_at - o.created_at)) END) / 3600.0, 1),
         0)::float AS "avgProcessHours"
     FROM orders o
     JOIN users u ON u.id = o.handler_id
     WHERE o.deleted_at IS NULL AND ${scope}
     GROUP BY u.id, u.name
     ORDER BY completed DESC, processing DESC, u.id ASC`,
    params,
  )
  ok(res, rows)
})

export default router
