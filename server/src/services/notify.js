// 站内通知（api-design.md §6）：异步副作用，不进状态事务
import { query } from '../db.js'

// 模板渲染 + 批量插入（business_event_id 幂等，重复触发不产生重复通知）
export const notify = async (recipientIds, { ticketId = null, kind, templateCode, vars = {}, eventKey = null }) => {
  const ids = [...new Set((recipientIds || []).filter(Boolean))]
  if (!ids.length) return
  const { rows: tpl } = await query(
    'SELECT title, content FROM notification_templates WHERE code = $1 AND active',
    [templateCode],
  )
  const render = (s) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
  const title = tpl[0] ? render(tpl[0].title) : kind
  const content = tpl[0] ? render(tpl[0].content) : ''
  for (const rid of ids) {
    await query(
      `INSERT INTO notifications (recipient_id, ticket_id, kind, title, content, business_event_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (business_event_id) DO NOTHING`,
      [rid, ticketId, kind, title, content, eventKey ? `${eventKey}:${rid}` : null],
    )
  }
}

// 触发失败不阻断主流程
export const notifyAsync = (...args) => notify(...args).catch((err) => console.error('[通知发送失败]', err.message))
