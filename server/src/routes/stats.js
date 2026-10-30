// 统计模块（api-design.md §7 + database-design.md §9：实时聚合，不建汇总表）
// 通用约定：period=day|week|month|quarter|year（默认 month）+ date 锚点（默认当前）；
// 数据范围后端强制（角色 > 页面筛选）：部长=本部门，员工=本人；导出仅超管
import { Router } from 'express'
import { query } from '../db.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { ok } from '../utils/respond.js'
import { assert, isDateString } from '../utils/validate.js'
import { parseDate, formatDateTime } from '../utils/datetime.js'
import { ROLES, STATUS, TERMINAL_STATUS, scopeSql } from '../constants.js'

const router = Router()
router.use(requireAuth)

const PERIODS = ['day', 'week', 'month', 'quarter', 'year']
// 趋势分桶粒度：day→hour，week/month→day，quarter/year→month
const BUCKET_UNIT = { day: 'hour', week: 'day', month: 'day', quarter: 'month', year: 'month' }

const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate())
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

// period + date 锚点 → 当前周期 [start, end) 与上一等长周期 [prevStart, start)
const periodRange = (period, dateStr) => {
  const anchor = dateStr ? parseDate(dateStr) : new Date()
  const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
  let start
  let prevStart
  switch (period) {
    case 'day':
      start = d; prevStart = addDays(d, -1); break
    case 'week': {
      const dow = (d.getDay() + 6) % 7 // 周一为一周起点
      start = addDays(d, -dow); prevStart = addDays(start, -7); break
    }
    case 'month':
      start = new Date(d.getFullYear(), d.getMonth(), 1); prevStart = addMonths(start, -1); break
    case 'quarter': {
      const q = Math.floor(d.getMonth() / 3) * 3
      start = new Date(d.getFullYear(), q, 1); prevStart = addMonths(start, -3); break
    }
    case 'year':
      start = new Date(d.getFullYear(), 0, 1); prevStart = new Date(d.getFullYear() - 1, 0, 1); break
  }
  return { start, end: period === 'day' ? addDays(start, 1) : period === 'week' ? addDays(start, 7) : period === 'month' ? addMonths(start, 1) : period === 'quarter' ? addMonths(start, 3) : new Date(start.getFullYear() + 1, 0, 1), prevStart }
}

const parsePeriod = (req) => {
  const period = req.query.period || 'month'
  assert(PERIODS.includes(period), 'period 仅支持 day/week/month/quarter/year')
  const { date } = req.query
  if (date !== undefined) assert(isDateString(date), 'date 格式应为 YYYY-MM-DD')
  return { period, ...periodRange(period, date) }
}

// 工单范围片段（tickets 别名 t）：超管 TRUE / 部长本部门 / 员工本人申请或处理
const ticketScope = scopeSql

// 周期过滤片段：params 追加 [start, end]，返回 `<列> >= $a AND <列> < $b`
const inPeriod = (column, range, params) => {
  params.push(range.start, range.end)
  return `${column} >= $${params.length - 1} AND ${column} < $${params.length}`
}

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0) // 百分比，1 位小数
const ratio = (num, den) => (den > 0 ? Math.round((num / den) * 10000) / 10000 : 0) // 0-1，4 位小数

// ---------- 数据聚合 ----------

// GET /api/stats/overview —— 总量/新增/完结/未完结/取消/驳回
const getOverview = async (req) => {
  const range = parsePeriod(req)
  const params = []
  const scope = ticketScope(req.user, 't', params)
  const base = `FROM tickets t WHERE t.deleted_at IS NULL AND ${scope}`
  const { rows: r } = await query(
    `SELECT
       (SELECT count(*)::int ${base}) AS total,
       (SELECT count(*)::int ${base} AND ${inPeriod('t.created_at', range, params)}) AS created,
       (SELECT count(*)::int ${base} AND t.status = 'closed' AND ${inPeriod('t.closed_at', range, params)}) AS closed,
       (SELECT count(*)::int ${base} AND t.status NOT IN ('closed','cancelled')) AS unclosed,
       (SELECT count(*)::int ${base} AND t.status = 'cancelled' AND ${inPeriod('t.closed_at', range, params)}) AS cancelled`,
    params,
  )
  // 驳回 = 周期内 reject_approval 动作数（ticket_logs，限范围内工单）
  const logParams = []
  const logScope = ticketScope(req.user, 't', logParams)
  const { rows: rr } = await query(
    `SELECT count(*)::int AS rejected
       FROM ticket_logs l JOIN tickets t ON t.id = l.ticket_id AND t.deleted_at IS NULL
      WHERE l.action = 'reject_approval' AND ${logScope} AND ${inPeriod('l.created_at', range, logParams)}`,
    logParams,
  )
  return { ...r[0], rejected: rr[0].rejected }
}
router.get('/overview', async (req, res) => ok(res, await getOverview(req)))

// GET /api/stats/workload —— 人员工作量（ticket_logs 按 operator 分组；员工仅本人一行）
const getWorkload = async (req) => {
  const range = parsePeriod(req)
  const user = req.user
  const params = []
  let userScope = 'TRUE'
  if (user.role === ROLES.LEADER) { params.push(user.dept); userScope = `u.dept = $${params.length}` }
  else if (user.role === ROLES.STAFF) { params.push(user.id); userScope = `u.id = $${params.length}` }
  const tScope = ticketScope(user, 't', params)
  params.push(range.start, range.end)
  const [s, e] = [`$${params.length - 1}`, `$${params.length}`]
  const { rows } = await query(
    `SELECT u.id AS "userId", u.name,
            count(l.id) FILTER (WHERE l.action = 'accept')::int          AS accepted,
            count(l.id) FILTER (WHERE l.action = 'start')::int           AS processed,
            count(l.id) FILTER (WHERE l.action = 'resolve')::int         AS closed,
            count(l.id) FILTER (WHERE l.action = 'reject_approval')::int AS rejected,
            count(l.id) FILTER (WHERE l.action = 'cancel')::int          AS cancelled
       FROM users u
       LEFT JOIN ticket_logs l
         ON l.operator_id = u.id AND l.created_at >= ${s} AND l.created_at < ${e}
        AND EXISTS (SELECT 1 FROM tickets t WHERE t.id = l.ticket_id AND t.deleted_at IS NULL AND ${tScope})
      WHERE ${userScope}
      GROUP BY u.id, u.name
      ORDER BY u.id`,
    params,
  )
  const totals = rows.reduce((sum, r) => sum + r.accepted + r.processed + r.closed + r.rejected + r.cancelled, 0)
  // 人均 = 合计 / 范围人数
  const avgPerPerson = rows.length ? Math.round((totals / rows.length) * 10) / 10 : 0
  return { list: rows, avgPerPerson }
}
router.get('/workload', async (req, res) => ok(res, await getWorkload(req)))

// GET /api/stats/sla —— 超时率统计（豁免 cancelled 记录不计分母）
const getSla = async (req) => {
  const range = parsePeriod(req)
  const params = []
  const tScope = ticketScope(req.user, 't', params)
  const period = inPeriod('s.created_at', range, params)
  const { rows } = await query(
    `SELECT s.metric_type AS metric,
            count(*) FILTER (WHERE s.sla_status <> 'cancelled')::int AS denom,
            count(*) FILTER (WHERE s.is_breached AND s.sla_status <> 'cancelled')::int AS breached
       FROM sla_records s
       JOIN tickets t ON t.id = s.ticket_id AND t.deleted_at IS NULL
      WHERE ${tScope} AND ${period}
      GROUP BY s.metric_type`,
    params,
  )
  const byMetric = new Map(rows.map((r) => [r.metric, r]))
  const rateOf = (m) => {
    const r = byMetric.get(m)
    return r ? pct(r.breached, r.denom) : 0
  }
  const aggParams = []
  const aggScope = ticketScope(req.user, 't', aggParams)
  const aggPeriod = inPeriod('s.created_at', range, aggParams)
  const { rows: agg } = await query(
    `SELECT count(*) FILTER (WHERE s.is_breached)::int AS "breachedCount",
            COALESCE(EXTRACT(EPOCH FROM avg(s.breached_duration) FILTER (WHERE s.is_breached)) * 1000, 0)::bigint AS "avgBreachedDuration"
       FROM sla_records s
       JOIN tickets t ON t.id = s.ticket_id AND t.deleted_at IS NULL
      WHERE ${aggScope} AND ${aggPeriod} AND s.sla_status <> 'cancelled'`,
    aggParams,
  )
  return {
    overallRate: rateOf('overall'),
    responseRate: rateOf('first_response'),
    approvalRate: rateOf('approval'),
    processingRate: rateOf('processing'),
    breachedCount: agg[0].breachedCount,
    avgBreachedDuration: Number(agg[0].avgBreachedDuration), // 毫秒
  }
}
router.get('/sla', async (req, res) => ok(res, await getSla(req)))

// GET /api/stats/sla/details —— 超时工单明细（员工仅本人相关行）
router.get('/sla/details', async (req, res) => {
  const range = parsePeriod(req)
  const params = []
  const tScope = ticketScope(req.user, 't', params)
  const period = inPeriod('s.created_at', range, params)
  const { rows } = await query(
    `SELECT s.ticket_id AS "ticketId", t.title, s.metric_type AS "metricType",
            EXTRACT(EPOCH FROM s.breached_duration) * 1000 AS "breachedDuration",
            h.name AS "handlerName", t.dept
       FROM sla_records s
       JOIN tickets t ON t.id = s.ticket_id AND t.deleted_at IS NULL
       LEFT JOIN users h ON h.id = t.current_handler_id
      WHERE s.is_breached AND s.sla_status <> 'cancelled' AND ${tScope} AND ${period}
      ORDER BY s.breached_duration DESC`,
    params,
  )
  ok(res, rows.map((r) => ({ ...r, breachedDuration: Math.round(Number(r.breachedDuration)) })))
})

// GET /api/stats/trend —— 新增/完结/超时趋势 + 同期对比
const getTrend = async (req) => {
  const range = parsePeriod(req)
  const unit = BUCKET_UNIT[range.period]
  const oneSide = async (rStart, rEnd) => {
    const params = []
    const tScope = ticketScope(req.user, 't', params)
    params.push(rStart, rEnd)
    const [s, e] = [`$${params.length - 1}`, `$${params.length}`]
    const { rows: created } = await query(
      `SELECT date_trunc('${unit}', t.created_at) AS bucket, count(*)::int AS n
         FROM tickets t WHERE t.deleted_at IS NULL AND ${tScope}
          AND t.created_at >= ${s} AND t.created_at < ${e}
        GROUP BY 1`,
      params,
    )
    const { rows: closed } = await query(
      `SELECT date_trunc('${unit}', t.closed_at) AS bucket, count(*)::int AS n
         FROM tickets t WHERE t.deleted_at IS NULL AND ${tScope}
          AND t.closed_at >= ${s} AND t.closed_at < ${e}
        GROUP BY 1`,
      params,
    )
    const bParams = []
    const bScope = ticketScope(req.user, 't', bParams)
    bParams.push(rStart, rEnd)
    const [bs, be] = [`$${bParams.length - 1}`, `$${bParams.length}`]
    const { rows: breached } = await query(
      `SELECT date_trunc('${unit}', ev.event_time) AS bucket, count(*)::int AS n
         FROM sla_events ev
         JOIN tickets t ON t.id = ev.ticket_id AND t.deleted_at IS NULL
        WHERE ev.event_type = 'sla_breached' AND ${bScope}
          AND ev.event_time >= ${bs} AND ev.event_time < ${be}
        GROUP BY 1`,
      bParams,
    )
    const map = new Map()
    const keyOf = (b) => formatDateTime(b).slice(0, unit === 'hour' ? 13 : unit === 'day' ? 10 : 7)
    const touch = (k) => {
      if (!map.has(k)) map.set(k, { bucket: k, created: 0, closed: 0, breached: 0 })
      return map.get(k)
    }
    for (const r of created) touch(keyOf(r.bucket)).created = r.n
    for (const r of closed) touch(keyOf(r.bucket)).closed = r.n
    for (const r of breached) touch(keyOf(r.bucket)).breached = r.n
    return [...map.values()].sort((a, b) => a.bucket.localeCompare(b.bucket))
  }
  const current = await oneSide(range.start, range.end)
  const previous = await oneSide(range.prevStart, range.start) // 上一等长周期同期序列
  return { current, previous }
}
router.get('/trend', async (req, res) => ok(res, await getTrend(req)))

// GET /api/stats/status-distribution —— 10 状态占比 + 超时未完结
const getStatusDist = async (req) => {
  const params = []
  const tScope = ticketScope(req.user, 't', params)
  const { rows } = await query(
    `SELECT t.status, count(*)::int AS n
       FROM tickets t WHERE t.deleted_at IS NULL AND ${tScope}
      GROUP BY t.status`,
    params,
  )
  const countMap = new Map(rows.map((r) => [r.status, r.n]))
  const total = rows.reduce((s, r) => s + r.n, 0)
  // 固定输出 10 状态（计数 0 也返回），占比=count/total
  const list = Object.values(STATUS).map((status) => ({
    status, count: countMap.get(status) || 0, ratio: ratio(countMap.get(status) || 0, total),
  }))
  // 超时未完结 = overall 记录 is_breached 且工单非终态（派生项，不占状态枚举）
  const oParams = []
  const oScope = ticketScope(req.user, 't', oParams)
  const { rows: od } = await query(
    `SELECT count(DISTINCT t.id)::int AS n
       FROM tickets t
       JOIN sla_records s ON s.ticket_id = t.id AND s.metric_type = 'overall' AND s.is_breached
      WHERE t.deleted_at IS NULL AND t.status NOT IN ('closed','cancelled') AND ${oScope}`,
    oParams,
  )
  return { list, overdueOpen: od[0].n }
}
router.get('/status-distribution', async (req, res) => ok(res, await getStatusDist(req)))

// GET /api/stats/export —— 报表导出 CSV（仅超管）
router.get('/export', requireRole(ROLES.ADMIN), async (req, res) => {
  const { module } = req.query
  assert(['overview', 'workload', 'sla', 'trend', 'status'].includes(module), 'module 不正确')
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const toCsv = (header, lines) =>
    '﻿' + [header, ...lines].map((l) => l.map(esc).join(',')).join('\r\n')

  let csv
  if (module === 'overview') {
    const d = await getOverview(req)
    csv = toCsv(['指标', '数值'], [
      ['总量', d.total], ['周期内新增', d.created], ['周期内完结', d.closed],
      ['未完结', d.unclosed], ['周期内取消', d.cancelled], ['周期内驳回', d.rejected],
    ])
  } else if (module === 'workload') {
    const d = await getWorkload(req)
    csv = toCsv(['用户ID', '姓名', '接单', '处理', '完结', '驳回', '取消'],
      d.list.map((r) => [r.userId, r.name, r.accepted, r.processed, r.closed, r.rejected, r.cancelled]))
  } else if (module === 'sla') {
    const d = await getSla(req)
    csv = toCsv(['指标', '数值'], [
      ['整体超时率(%)', d.overallRate], ['响应超时率(%)', d.responseRate],
      ['审批超时率(%)', d.approvalRate], ['处理超时率(%)', d.processingRate],
      ['超时记录数', d.breachedCount], ['平均超时时长(分钟)', Math.round(d.avgBreachedDuration / 60000)],
    ])
  } else if (module === 'trend') {
    const d = await getTrend(req)
    csv = toCsv(['周期', '桶', '新增', '完结', '超时'], [
      ...d.current.map((r) => ['本期', r.bucket, r.created, r.closed, r.breached]),
      ...d.previous.map((r) => ['同期', r.bucket, r.created, r.closed, r.breached]),
    ])
  } else {
    const d = await getStatusDist(req)
    const { rows: dicts } = await query(
      `SELECT code, label FROM sys_dictionaries WHERE dict_type = 'ticket_status' AND active`)
    const labelOf = (code) => dicts.find((x) => x.code === code)?.label ?? code
    csv = toCsv(['状态', '数量', '占比'],
      d.list.map((r) => [labelOf(r.status), r.count, r.ratio]))
    csv += `\r\n${esc('超时未完结')},${esc(d.overdueOpen)},${esc('')}`
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="stats-${module}-${Date.now()}.csv"`)
  res.send(csv)
})

export default router
