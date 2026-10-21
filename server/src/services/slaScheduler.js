// SLA 定时扫描（database-design.md §5.6）：每分钟扫 running/breached 记录，
// 累计有效时长、触发预警/超时事件与通知；通知为异步副作用
import { pool, query, withTx } from '../db.js'
import { loadCalendar, workElapsedMs } from './calendar.js'
import { notifyAsync } from './notify.js'
import { insertSlaEvent, msToInterval } from './sla.js'

const METRIC_LABEL = {
  first_response: '首次响应', approval: '审批', processing: '处理',
  confirmation: '确认', payment: '付款', overall: '整体完成',
}

// 通知接收人：当前处理人 + 本部门部长
const recipientsOf = async (ticketId) => {
  const { rows } = await query(
    `SELECT t.current_handler_id AS handler, t.title, t.dept,
            (SELECT id FROM users WHERE role = '技术部部长' AND dept = t.dept AND status = '启用' ORDER BY id LIMIT 1) AS leader
       FROM tickets t WHERE t.id = $1`,
    [ticketId],
  )
  const r = rows[0]
  return { ids: [r?.handler, r?.leader].filter(Boolean), title: r?.title ?? ticketId }
}

export const scanOnce = async () => {
  const { rows: recs } = await query(
    `SELECT s.id, s.ticket_id, s.metric_type, s.sla_status, s.is_breached, s.started_at,
            s.target_snapshot,
            EXTRACT(EPOCH FROM s.elapsed_duration)  * 1000 AS elapsed_ms,
            EXTRACT(EPOCH FROM s.target_duration)   * 1000 AS target_ms,
            EXTRACT(EPOCH FROM s.breached_duration) * 1000 AS breached_ms
       FROM sla_records s
      WHERE s.sla_status IN ('running','breached')`,
  )
  if (!recs.length) return

  // 每个扫描周期缓存日历
  const calCache = new Map()
  const calCtxOf = async (id) => {
    if (!id) return null
    if (!calCache.has(id)) calCache.set(id, await loadCalendar({ query }, id))
    return calCache.get(id)
  }

  // 已触发过的预警阈值（去重依据）
  const ids = recs.map((r) => r.id)
  const { rows: warnEvents } = await query(
    `SELECT sla_id, metadata->>'threshold' AS threshold FROM sla_events
      WHERE event_type = 'sla_warning' AND sla_id = ANY($1::bigint[])`,
    [ids],
  )
  const warned = new Set(warnEvents.map((w) => `${w.sla_id}:${w.threshold}`))
  const { rows: lastNotifies } = await query(
    `SELECT sla_id, max(event_time) AS last_at FROM sla_events
      WHERE event_type IN ('sla_breached','sla_notification_sent') AND sla_id = ANY($1::bigint[])
      GROUP BY sla_id`,
    [ids],
  )
  const lastNotifyAt = new Map(lastNotifies.map((n) => [n.sla_id, new Date(n.last_at).getTime()]))

  const now = new Date()
  for (const rec of recs) {
    try {
      const calCtx = await calCtxOf(rec.target_snapshot?.calendarId)
      const elapsed = (Number(rec.elapsed_ms) || 0) + (calCtx
        ? workElapsedMs(new Date(rec.started_at), now, calCtx)
        : now.getTime() - new Date(rec.started_at).getTime())
      const target = Number(rec.target_ms)
      const ratio = (elapsed / target) * 100

      if (!rec.is_breached) {
        // 预警阈值（50/75/90，首次触发各一条）
        for (const th of (rec.target_snapshot?.warningThresholds || [50, 75, 90]).sort((a, b) => a - b)) {
          if (ratio >= th && !warned.has(`${rec.id}:${th}`)) {
            await withTx(async (client) => {
              await insertSlaEvent(client, {
                ticketId: rec.ticket_id, slaId: rec.id, type: 'sla_warning',
                fromStatus: rec.sla_status, toStatus: rec.sla_status, source: 'scheduler',
                elapsedMs: elapsed, remainingMs: target - elapsed,
                metadata: { threshold: th },
              })
            })
            const { ids: to, title } = await recipientsOf(rec.ticket_id)
            notifyAsync(to, {
              ticketId: rec.ticket_id, kind: 'sla_warning', templateCode: 'sla_warning',
              vars: { id: rec.ticket_id, title, metric: METRIC_LABEL[rec.metric_type], threshold: th },
              eventKey: `sla_warning:${rec.id}:${th}`,
            })
          }
        }
        // 首次超时
        if (elapsed >= target) {
          await withTx(async (client) => {
            await client.query(
              `UPDATE sla_records SET sla_status = 'breached', is_breached = true,
                      breached_duration = $2, updated_at = now()
               WHERE id = $1 AND sla_status = 'running'`,
              [rec.id, msToInterval(elapsed - target)],
            )
            await insertSlaEvent(client, {
              ticketId: rec.ticket_id, slaId: rec.id, type: 'sla_breached',
              fromStatus: 'running', toStatus: 'breached', source: 'scheduler',
              elapsedMs: elapsed, remainingMs: target - elapsed,
            })
          })
          const { ids: to, title } = await recipientsOf(rec.ticket_id)
          notifyAsync(to, {
            ticketId: rec.ticket_id, kind: 'sla_breached', templateCode: 'sla_breached',
            vars: { id: rec.ticket_id, title, metric: METRIC_LABEL[rec.metric_type] },
            eventKey: `sla_breached:${rec.id}`,
          })
        }
      } else {
        // 已超时：累计超时时长；按 repeat_remind_interval 重复提醒
        const repeatMs = Number(rec.target_snapshot?.repeatRemindMs) || 0
        const lastAt = lastNotifyAt.get(rec.id) || 0
        const shouldRemind = repeatMs > 0 && now.getTime() - lastAt >= repeatMs
        await query(
          `UPDATE sla_records SET breached_duration = $2, updated_at = now() WHERE id = $1`,
          [rec.id, msToInterval(elapsed - target)],
        )
        if (shouldRemind) {
          await insertSlaEvent(pool, {
            ticketId: rec.ticket_id, slaId: rec.id, type: 'sla_notification_sent',
            fromStatus: 'breached', toStatus: 'breached', source: 'scheduler',
            elapsedMs: elapsed, remainingMs: target - elapsed,
          })
          const { ids: to, title } = await recipientsOf(rec.ticket_id)
          notifyAsync(to, {
            ticketId: rec.ticket_id, kind: 'sla_breached', templateCode: 'sla_breached',
            vars: { id: rec.ticket_id, title, metric: METRIC_LABEL[rec.metric_type] },
            eventKey: `sla_remind:${rec.id}:${now.getTime()}`,
          })
          lastNotifyAt.set(rec.id, now.getTime())
        }
      }
    } catch (err) {
      console.error(`[SLA 扫描] 记录 ${rec.id} 处理失败：`, err.message)
    }
  }
}

// 挂载到服务进程：按 system_params.sla_scan_interval_sec 周期执行
export const startSlaScheduler = async () => {
  const { rows } = await query(`SELECT value FROM system_params WHERE key = 'sla_scan_interval_sec'`)
  const intervalSec = Math.max(10, Number(rows[0]?.value) || 60)
  const timer = setInterval(() => {
    scanOnce().catch((err) => console.error('[SLA 扫描] 周期执行失败：', err.message))
  }, intervalSec * 1000)
  timer.unref?.()
  console.log(`SLA 扫描器已启动：每 ${intervalSec}s 扫描一次`)
}
