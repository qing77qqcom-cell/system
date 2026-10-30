// 日志查询（api-design.md §5：仅超管）
import { Router } from 'express'
import { query } from '../db.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { ok } from '../utils/respond.js'
import { assert, isDateString } from '../utils/validate.js'
import { parseDate, formatDateTime } from '../utils/datetime.js'
import { ROLES } from '../constants.js'

const router = Router()
router.use(requireAuth, requireRole(ROLES.ADMIN))

const dateRange = (req, params, conds, column) => {
  const { dateFrom, dateTo } = req.query
  if (dateFrom !== undefined) assert(isDateString(dateFrom), 'dateFrom 格式应为 YYYY-MM-DD')
  if (dateTo !== undefined) assert(isDateString(dateTo), 'dateTo 格式应为 YYYY-MM-DD')
  if (dateFrom) { params.push(parseDate(dateFrom)); conds.push(`${column} >= $${params.length}`) }
  if (dateTo) {
    const to = parseDate(dateTo)
    to.setDate(to.getDate() + 1)
    params.push(to)
    conds.push(`${column} < $${params.length}`)
  }
}

// GET /api/login-logs?username/success/dateFrom/dateTo —— 登录留痕
router.get('/login-logs', async (req, res) => {
  const { username, success } = req.query
  const params = []
  const conds = []
  if (username) {
    params.push(`%${String(username).trim().toLowerCase()}%`)
    conds.push(`username ILIKE $${params.length}`)
  }
  if (success !== undefined) {
    assert(['true', 'false'].includes(success), 'success 仅支持 true/false')
    params.push(success === 'true')
    conds.push(`success = $${params.length}`)
  }
  dateRange(req, params, conds, 'l.created_at')
  const { rows } = await query(
    `SELECT l.id, l.user_id AS "userId", u.name AS "userName", l.username,
            l.success, l.ip::text AS ip, l.user_agent AS "userAgent",
            l.created_at AS "createdAt"
       FROM login_logs l LEFT JOIN users u ON u.id = l.user_id
      ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
      ORDER BY l.id DESC`,
    params,
  )
  ok(res, rows.map((r) => ({ ...r, createdAt: formatDateTime(r.createdAt) })))
})

// GET /api/audit-logs?actorId/targetType/targetId/dateFrom/dateTo —— 配置与权限变更审计
router.get('/audit-logs', async (req, res) => {
  const { actorId, targetType, targetId } = req.query
  const params = []
  const conds = []
  if (actorId) {
    assert(Number.isInteger(Number(actorId)), 'actorId 不合法')
    params.push(Number(actorId))
    conds.push(`l.actor_id = $${params.length}`)
  }
  if (targetType) { params.push(targetType); conds.push(`l.target_type = $${params.length}`) }
  if (targetId) { params.push(targetId); conds.push(`l.target_id = $${params.length}`) }
  dateRange(req, params, conds, 'l.created_at')
  const { rows } = await query(
    `SELECT l.id, l.actor_id AS "actorId", u.name AS "actorName",
            l.target_type AS "targetType", l.target_id AS "targetId", l.action,
            l.before, l.after, l.created_at AS "createdAt"
       FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id
      ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
      ORDER BY l.id DESC`,
    params,
  )
  ok(res, rows.map((r) => ({ ...r, createdAt: formatDateTime(r.createdAt) })))
})

export default router
