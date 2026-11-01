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

// ———————— 通用工具 ————————

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

/**
 * 统一解析分页参数：page / pageSize
 * 默认 page=1, pageSize=50；最大 pageSize 200 防全表扫
 */
function parsePagination(req) {
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

/**
 * 统一返回分页结构 { total, list }
 * @param {Array} rows - 已格式化的数据行
 * @param {number} total - 总条数（不受 LIMIT 影响）
 * @param {object} pager - { page, pageSize }
 */
function paginate(rows, total, pager) {
  return {
    total,
    list: rows,
    page: pager.page,
    pageSize: pager.pageSize,
    totalPages: Math.max(1, Math.ceil(total / pager.pageSize)),
  }
}

/**
 * 通用分页查询构造器：先 COUNT 拿 total，再带 LIMIT/OFFSET 查数据
 *
 * @param {string} baseSelect  - 带 WHERE 但不带 ORDER/LIMIT 的 SELECT 语句
 * @param {string} countSelect - 等价的 COUNT(*) 语句（通常把 SELECT 列表换成 count(*)）
 * @param {Array}  params      - WHERE 条件参数
 */
async function paginatedQuery(baseSelect, countSelect, params) {
  const { page, pageSize, offset } = parsePagination(arguments[3] || { query: {} })

  // COUNT 查询（同样的 WHERE 条件，不带 JOIN 里没用的表更高效；这里直接复用 conds）
  const countResult = await query(countSelect, params)
  const total = parseInt(countResult.rows[0].count, 10)

  // 数据查询 —— LIMIT/OFFSET 追加到 params 末尾
  const dataParams = [...params, pageSize, offset]
  const { rows } = await query(
    `${baseSelect} ORDER BY l.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    dataParams,
  )

  return { rows, total, pager: { page, pageSize } }
}

// ———————— GET /api/logs/login-logs ————————
// 分页查询：?page=1&pageSize=50&username=&success=&dateFrom=&dateTo
router.get('/login-logs', async (req, res) => {
  const { username, success } = req.query
  const params = []
  const conds = []

  if (username) {
    params.push(`%${String(username).trim().toLowerCase()}%`)
    conds.push(`l.username ILIKE $${params.length}`)
  }
  if (success !== undefined) {
    assert(['true', 'false'].includes(success), 'success 仅支持 true/false')
    params.push(success === 'true')
    conds.push(`l.success = $${params.length}`)
  }
  dateRange(req, params, conds, 'l.created_at')

  const whereClause = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const pager = parsePagination(req)

  // COUNT
  const countSql = `SELECT count(*) FROM login_logs l ${whereClause}`
  const countResult = await query(countSql, params)
  const total = parseInt(countResult.rows[0].count, 10)

  // DATA
  const dataSql = `
    SELECT l.id, l.user_id AS "userId", u.name AS "userName", l.username,
           l.success, l.ip::text AS ip, l.user_agent AS "userAgent",
           l.created_at AS "createdAt"
      FROM login_logs l LEFT JOIN users u ON u.id = l.user_id
     ${whereClause}
     ORDER BY l.id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
  const { rows } = await query(dataSql, [...params, pager.pageSize, pager.offset])

  ok(
    res,
    paginate(
      rows.map((r) => ({ ...r, createdAt: formatDateTime(r.createdAt) })),
      total,
      pager,
    ),
  )
})

// ———————— GET /api/logs/login-logs/export ————————
// 导出 CSV：筛选条件和分页列表一致，不分页全量导出（上限 10000 防全表扫）
// 前端用法：request.get('/logs/login-logs/export', { params, responseType: 'blob' })
router.get('/login-logs/export', async (req, res) => {
  const { username, success } = req.query
  const params = []
  const conds = []

  if (username) {
    params.push(`%${String(username).trim().toLowerCase()}%`)
    conds.push(`l.username ILIKE $${params.length}`)
  }
  if (success !== undefined && success !== '') {
    assert(['true', 'false'].includes(success), 'success 仅支持 true/false')
    params.push(success === 'true')
    conds.push(`l.success = $${params.length}`)
  }
  dateRange(req, params, conds, 'l.created_at')

  const whereClause = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  // 上限 10000 行，防止一次导出百万行撑爆内存
  const MAX_ROWS = 10000

  const sql = `
    SELECT l.id, u.name AS "userName", l.username, l.success,
           l.ip::text AS ip, l.user_agent AS "userAgent",
           l.created_at AS "createdAt"
      FROM login_logs l LEFT JOIN users u ON u.id = l.user_id
     ${whereClause}
     ORDER BY l.id DESC
     LIMIT ${MAX_ROWS}`
  const { rows } = await query(sql, params)

  // CSV 转义：双引号包裹 + 内部双引号翻倍
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const header = ['ID', '用户', '登录账号', '结果', 'IP 地址', 'User Agent', '登录时间']
  const lines = rows.map((r) => [
    r.id,
    r.userName || '',
    r.username,
    r.success ? '成功' : '失败',
    r.ip,
    r.userAgent || '',
    formatDateTime(r.createdAt),
  ].map(esc).join(','))

  // BOM 头保证 Excel 打开中文不乱码
  const csv = '\uFEFF' + [header.map(esc).join(','), ...lines].join('\r\n')

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="login-logs-${ts}.csv"`)
  res.send(csv)
})

// ———————— GET /api/logs/audit-logs ————————
// 分页查询：?page=1&pageSize=50&actorId=&targetType=&targetId=&dateFrom=&dateTo
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

  const whereClause = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const pager = parsePagination(req)

  // COUNT
  const countSql = `SELECT count(*) FROM audit_logs l ${whereClause}`
  const countResult = await query(countSql, params)
  const total = parseInt(countResult.rows[0].count, 10)

  // DATA
  const dataSql = `
    SELECT l.id, l.actor_id AS "actorId", u.name AS "actorName",
           l.target_type AS "targetType", l.target_id AS "targetId", l.action,
           l.before, l.after, l.created_at AS "createdAt"
      FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id
     ${whereClause}
     ORDER BY l.id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
  const { rows } = await query(dataSql, [...params, pager.pageSize, pager.offset])

  ok(
    res,
    paginate(
      rows.map((r) => ({ ...r, createdAt: formatDateTime(r.createdAt) })),
      total,
      pager,
    ),
  )
})

export default router
