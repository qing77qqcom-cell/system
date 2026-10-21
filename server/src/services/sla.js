// SLA 计时引擎（database-design.md §5.4-§5.7）
// 约定：elapsed_duration 累计「已封存」有效时长；started_at 为当前计时段起点；
// 实时已消耗 = elapsed_duration + segment(started_at → now)
import { loadCalendar, workElapsedMs, addWorkMs, targetToMs, isWorkUnit } from './calendar.js'

const msToInterval = (ms) => `${Math.round(ms)} milliseconds`

// 读取记录的累计毫秒（pg interval → ms）
const EPOCH_MS = `EXTRACT(EPOCH FROM elapsed_duration) * 1000`

// 规则匹配：优先级精确规则优先，NULL 优先级兜底；同组取最高版本
const findRule = async (client, { ticketType, metric, priority, nodeSeq }) => {
  const { rows } = await client.query(
    `SELECT *, EXTRACT(EPOCH FROM repeat_remind_interval) * 1000 AS repeat_remind_ms
       FROM sla_rules
      WHERE ticket_type = $1 AND metric_type = $2 AND active
        AND node_seq IS NOT DISTINCT FROM $3
        AND (priority = $4 OR priority IS NULL)
      ORDER BY (priority IS NULL), version DESC
      LIMIT 1`,
    [ticketType, metric, nodeSeq ?? null, priority ?? null],
  )
  return rows[0] || null
}

const insertEvent = (client, e) =>
  client.query(
    `INSERT INTO sla_events
       (ticket_id, sla_id, event_type, from_status, to_status, operator_id, trigger_source,
        business_event_id, elapsed_duration, remaining_duration, reason, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (business_event_id) DO NOTHING`,
    [
      e.ticketId, e.slaId, e.type, e.fromStatus ?? null, e.toStatus ?? null,
      e.operatorId ?? null, e.source, e.beId ?? null,
      e.elapsedMs != null ? msToInterval(e.elapsedMs) : null,
      e.remainingMs != null ? msToInterval(e.remainingMs) : null,
      e.reason ?? null, e.metadata ? JSON.stringify(e.metadata) : null,
    ],
  )

// 当前已消耗毫秒（实时）
export const currentElapsedMs = (rec, calCtx, now = new Date()) => {
  let ms = Number(rec.elapsed_ms) || 0
  if (rec.started_at) {
    ms += calCtx
      ? workElapsedMs(new Date(rec.started_at), now, calCtx)
      : now.getTime() - new Date(rec.started_at).getTime()
  }
  return ms
}

// 创建 SLA 记录（幂等：同工单/指标/轮次/节点的活跃记录只建一次）
export const createSlaRecord = async (client, {
  ticket, metric, startedAt = new Date(), round = null, nodeSeq = null,
  operatorId = null, source = 'business_event', metadata = null,
}) => {
  const rule = await findRule(client, {
    ticketType: ticket.type, metric, priority: ticket.priority, nodeSeq,
  })
  if (!rule) return null // 未配置规则的指标不计时

  // 幂等：仅拦「活跃」记录；已完结（met/breached_closed）不阻断新一轮计时（如驳回重提、reopen）
  const { rows: dup } = await client.query(
    `SELECT id FROM sla_records
      WHERE ticket_id = $1 AND metric_type = $2
        AND approval_round IS NOT DISTINCT FROM $3
        AND node_seq IS NOT DISTINCT FROM $4
        AND sla_status IN ('pending','running','paused','breached')`,
    [ticket.id, metric, round, nodeSeq],
  )
  if (dup[0]) return dup[0].id

  const calCtx = rule.calendar_id ? await loadCalendar(client, rule.calendar_id) : null
  const targetMs = targetToMs(rule.target_value, rule.target_unit, calCtx)
  const deadline = startedAt
    ? (calCtx && isWorkUnit(rule.target_unit) ? addWorkMs(startedAt, targetMs, calCtx) : new Date(startedAt.getTime() + targetMs))
    : null

  const { rows } = await client.query(
    `INSERT INTO sla_records
       (ticket_id, metric_type, priority, approval_round, node_seq, rule_version,
        target_snapshot, target_duration, started_at, deadline_at, sla_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      ticket.id, metric, ticket.priority ?? null, round, nodeSeq, rule.version,
      JSON.stringify({
        ruleId: rule.id, targetValue: rule.target_value, targetUnit: rule.target_unit,
        calendarId: rule.calendar_id, warningThresholds: rule.warning_thresholds,
        repeatRemindMs: rule.repeat_remind_ms ?? null,
      }),
      msToInterval(targetMs),
      startedAt, deadline, startedAt ? 'running' : 'pending',
    ],
  )
  const slaId = rows[0].id
  const base = `create:${ticket.id}:${metric}:${round ?? 0}:${nodeSeq ?? 0}`
  await insertEvent(client, {
    ticketId: ticket.id, slaId, type: 'sla_created', toStatus: startedAt ? 'running' : 'pending',
    operatorId, source, beId: `${base}:created`,
    elapsedMs: 0, remainingMs: targetMs, metadata,
  })
  if (startedAt) {
    await insertEvent(client, {
      ticketId: ticket.id, slaId, type: 'sla_started', fromStatus: 'pending', toStatus: 'running',
      operatorId, source, beId: `${base}:started`, elapsedMs: 0, remainingMs: targetMs,
    })
  }
  return slaId
}

// 查询工单的活跃记录（带累计毫秒与目标毫秒）
const activeRecords = async (client, ticketId, { metric = null, round = null, nodeSeq = null } = {}) => {
  const { rows } = await client.query(
    `SELECT id, ticket_id, metric_type, approval_round, node_seq, sla_status, is_breached,
            started_at, target_snapshot, ${EPOCH_MS} AS elapsed_ms,
            EXTRACT(EPOCH FROM target_duration) * 1000 AS target_ms,
            EXTRACT(EPOCH FROM breached_duration) * 1000 AS breached_ms
       FROM sla_records
      WHERE ticket_id = $1 AND sla_status IN ('pending','running','paused','breached')
        AND ($2::sla_metric IS NULL OR metric_type = $2)
        AND ($3::int  IS NULL OR approval_round = $3)
        AND ($4::smallint IS NULL OR node_seq = $4)`,
    [ticketId, metric, round, nodeSeq],
  )
  return rows
}

const calCtxFor = async (client, rec) => {
  const calendarId = rec.target_snapshot?.calendarId
  return calendarId ? loadCalendar(client, calendarId) : null
}

// 指标完结：met / breached_closed
export const completeSlaRecords = async (client, {
  ticketId, metric, round = null, nodeSeq = null, endedAt = new Date(),
  operatorId = null, source = 'business_event',
}) => {
  const recs = await activeRecords(client, ticketId, { metric, round, nodeSeq })
  for (const rec of recs) {
    if (rec.sla_status === 'pending') {
      // 未启动即结束（如瞬间完成）：按 0 消耗完结
      await finish(client, rec, 0, endedAt, operatorId, source)
      continue
    }
    const calCtx = await calCtxFor(client, rec)
    const elapsed = currentElapsedMs(rec, calCtx, endedAt)
    await finish(client, rec, elapsed, endedAt, operatorId, source)
  }
}

const finish = async (client, rec, elapsedMs, endedAt, operatorId, source) => {
  const breached = rec.is_breached || elapsedMs >= Number(rec.target_ms)
  const toStatus = breached ? 'breached_closed' : 'met'
  await client.query(
    `UPDATE sla_records SET
       sla_status = $2, is_breached = $3, ended_at = $4,
       elapsed_duration = $5, breached_duration = $6,
       started_at = NULL, deadline_at = NULL, updated_at = now()
     WHERE id = $1`,
    [
      rec.id, toStatus, breached, endedAt,
      msToInterval(elapsedMs), msToInterval(Math.max(0, elapsedMs - Number(rec.target_ms))),
    ],
  )
  await insertEvent(client, {
    ticketId: rec.ticket_id, slaId: rec.id,
    type: breached ? 'sla_closed_after_breach' : 'sla_completed',
    fromStatus: rec.sla_status, toStatus, operatorId, source,
    beId: `finish:${rec.id}`, elapsedMs, remainingMs: Number(rec.target_ms) - elapsedMs,
  })
}

// 工单内全部活跃记录取消（工单取消 / SLA 豁免）
export const cancelSlaRecords = async (client, { ticketId, reason, operatorId = null, source = 'business_event' }) => {
  const recs = await activeRecords(client, ticketId)
  for (const rec of recs) {
    const calCtx = await calCtxFor(client, rec)
    const elapsed = currentElapsedMs(rec, calCtx)
    await client.query(
      `UPDATE sla_records SET sla_status = 'cancelled', started_at = NULL, deadline_at = NULL,
              elapsed_duration = $2, updated_at = now()
       WHERE id = $1`,
      [rec.id, msToInterval(elapsed)],
    )
    await insertEvent(client, {
      ticketId, slaId: rec.id, type: 'sla_cancelled', fromStatus: rec.sla_status, toStatus: 'cancelled',
      operatorId, source, beId: `cancel:${rec.id}:${reason ? 'manual' : 'auto'}`,
      elapsedMs: elapsed, reason: reason ?? null,
    })
  }
}

// 挂起暂停：running/breached → paused（封存已消耗时长）
// metrics 可选：按文档 §5.6 仅 processing/confirmation/payment/overall 随挂起暂停
export const pauseSlaRecords = async (client, { ticketId, reason, operatorId = null, source = 'business_event', metrics = null }) => {
  const recs = await activeRecords(client, ticketId)
  for (const rec of recs) {
    if (metrics && !metrics.includes(rec.metric_type)) continue
    if (rec.sla_status !== 'running' && rec.sla_status !== 'breached') continue
    const calCtx = await calCtxFor(client, rec)
    const elapsed = currentElapsedMs(rec, calCtx)
    await client.query(
      `UPDATE sla_records SET sla_status = 'paused', pause_reason = $2,
              elapsed_duration = $3, started_at = NULL, deadline_at = NULL, updated_at = now()
       WHERE id = $1`,
      [rec.id, reason ?? null, msToInterval(elapsed)],
    )
    await insertEvent(client, {
      ticketId, slaId: rec.id, type: 'sla_paused', fromStatus: rec.sla_status, toStatus: 'paused',
      operatorId, source,
      elapsedMs: elapsed, remainingMs: Number(rec.target_ms) - elapsed, reason: reason ?? null,
    })
  }
}

// 恢复：paused → running，按剩余时长重算 deadline（metrics 与暂停时保持一致）
export const resumeSlaRecords = async (client, { ticketId, operatorId = null, source = 'business_event', metrics = null }) => {
  const now = new Date()
  const recs = await activeRecords(client, ticketId)
  for (const rec of recs) {
    if (metrics && !metrics.includes(rec.metric_type)) continue
    if (rec.sla_status !== 'paused') continue
    const calCtx = await calCtxFor(client, rec)
    const targetMs = Number(rec.target_ms)
    const elapsedMs = Number(rec.elapsed_ms) || 0
    const remainingMs = targetMs - elapsedMs
    const unit = rec.target_snapshot?.targetUnit
    const deadline = remainingMs > 0
      ? (calCtx && isWorkUnit(unit) ? addWorkMs(now, remainingMs, calCtx) : new Date(now.getTime() + remainingMs))
      : now
    const toStatus = rec.is_breached || remainingMs <= 0 ? 'breached' : 'running'
    await client.query(
      `UPDATE sla_records SET sla_status = $2, pause_reason = NULL,
              started_at = $3, deadline_at = $4, updated_at = now()
       WHERE id = $1`,
      [rec.id, toStatus, now, deadline],
    )
    await insertEvent(client, {
      ticketId, slaId: rec.id, type: 'sla_resumed', fromStatus: 'paused', toStatus,
      operatorId, source, elapsedMs, remainingMs,
    })
  }
}

// 供 scheduler/backfill 复用的查询
export const listActiveSlaRecords = (client, ticketId, filters) => activeRecords(client, ticketId, filters)
export { insertEvent as insertSlaEvent, msToInterval, findRule }
