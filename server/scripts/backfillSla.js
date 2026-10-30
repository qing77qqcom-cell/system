// 历史工单 SLA 回填脚本（database-design.md §5.7）
// 从现有工单与日志还原 SLA 记录：
// 1. 未软删工单按 type+status 推导 overall（必建）+ 当前阶段指标
// 2. 已过期直接 breached + 补事件；终态按 closed_at 比 deadline 置 met/breached_closed
// 3. 豁免置 cancelled
// 4. 幂等 business_event_id='backfill:{ticket}:{metric}'
import { pool } from '../src/db.js'
import { createSlaRecord, completeSlaRecords, cancelSlaRecords } from '../src/services/sla.js'
import { loadCalendar, workElapsedMs, addWorkMs, targetToMs, isWorkUnit } from '../src/services/calendar.js'
import { query, withTx } from '../src/db.js'
import { STATUS, TERMINAL_STATUS, TICKET_TYPES } from '../src/constants.js'

const triggerSource = 'system_rule'

// 从 ticket_logs 找某工单某动作的最早时间（缺失则 null，脚本会用 created_at 兜底）
const firstLogAt = async (client, ticketId, actions) => {
  const { rows } = await client.query(
    `SELECT created_at FROM ticket_logs WHERE ticket_id = $1 AND action = ANY($2) ORDER BY created_at LIMIT 1`,
    [ticketId, actions],
  )
  return rows[0]?.created_at ?? null
}

// 从 approval_records 找某工单某轮某序号的 acted_at
const approvalActedAt = async (client, ticketId, round, seq) => {
  const { rows } = await client.query(
    `SELECT acted_at FROM approval_records WHERE ticket_id = $1 AND round = $2 AND seq = $3 AND status IN ('approved','rejected') ORDER BY acted_at LIMIT 1`,
    [ticketId, round, seq],
  )
  return rows[0]?.acted_at ?? null
}

// 推导某工单当前阶段应激活的 SLA 指标
const currentMetricForStatus = (ticket) => {
  const t = ticket.type
  const s = ticket.status
  // 先检查审批流：pending_approval / 审批中 → approval
  if (s === STATUS.PENDING_APPROVAL) return 'approval'
  if (t === 'fault_repair') {
    if (s === STATUS.PENDING_ASSIGNMENT) return 'first_response'
    if (s === STATUS.PENDING_ACCEPTANCE) return 'first_response'
    if (s === STATUS.PENDING_PROCESSING || s === STATUS.PROCESSING) return 'processing'
    if (s === STATUS.PENDING_CONFIRMATION) return 'confirmation'
  } else if (t === 'account_permission') {
    // 账号工单无 first_response 阶段；pending 状态进入 processing
    if (s === STATUS.PENDING_PROCESSING || s === STATUS.PROCESSING) return 'processing'
  } else if (t === 'reimbursement') {
    if (s === STATUS.PENDING_PROCESSING || s === STATUS.PROCESSING) return 'payment'
  }
  return null
}

// 终态工单的 overall 结束时间
const terminalAt = (ticket) => {
  if (ticket.closed_at) return ticket.closed_at
  if (ticket.status === STATUS.CANCELLED) return ticket.closed_at || new Date(ticket.updated_at).getTime() < Date.now() ? ticket.updated_at : ticket.created_at
  return null
}

const main = async () => {
  console.log('=== SLA 历史回填开始 ===')
  const { rows: tickets } = await query(
    `SELECT t.*, a.role AS applicant_role FROM tickets t
       JOIN users a ON a.id = t.applicant_id
      WHERE t.deleted_at IS NULL AND t.sla_exempt IS NOT TRUE ORDER BY t.created_at`,
  )
  console.log(`待处理工单数：${tickets.length}`)

  let ok = 0, skip = 0, fail = 0

  for (const t of tickets) {
    try {
      await withTx(async (client) => {
        // --- 幂等检查 ---
        const { rows: dup } = await client.query(
          `SELECT 1 FROM sla_records
             WHERE ticket_id = $1 AND metric_type = 'overall'
               AND sla_status IN ('met','breached_closed','cancelled')`,
          [t.id],
        )
        if (dup[0]) { skip++; return }

        // --- overall ---
        const overallStartedAt = t.first_submitted_at ?? t.created_at
        await createSlaRecord(client, {
          ticket: { ...t, applicant_role: t.applicant_role },
          metric: 'overall', startedAt: overallStartedAt, source: triggerSource,
        })

        const isTerminal = TERMINAL_STATUS.includes(t.status)
        if (isTerminal) {
          // 终态 overall：按 closed_at 完结
          const endAt = terminalAt(t) || t.updated_at || new Date()
          await completeSlaRecords(client, { ticketId: t.id, metric: 'overall', endedAt: endAt, source: triggerSource })
        }

        // --- 当前阶段指标 ---
        const metric = currentMetricForStatus(t)
        if (metric) {
          let startedAt = null
          if (metric === 'first_response') {
            startedAt = await firstLogAt(client, t.id, ['submit', 'accept']) || t.created_at
          } else if (metric === 'approval') {
            startedAt = t.first_submitted_at || await firstLogAt(client, t.id, ['submit']) || t.created_at
          } else if (metric === 'processing') {
            startedAt = await firstLogAt(client, t.id, ['accept', 'reopen']) || t.updated_at
          } else if (metric === 'confirmation') {
            // resolve 后进入待确认
            startedAt = await firstLogAt(client, t.id, ['resolve']) || t.updated_at
          } else if (metric === 'payment') {
            // L2 通过后进入待处理
            startedAt = await firstLogAt(client, t.id, ['approve']) || t.updated_at
          }
          if (startedAt) {
            await createSlaRecord(client, {
              ticket: { ...t, applicant_role: t.applicant_role },
              metric, startedAt, source: triggerSource,
              metadata: { estimated: !await firstLogAt(client, t.id, [
                metric === 'approval' ? 'submit' : metric === 'processing' ? 'accept' : 'resolve',
              ]) },
            })
          }
        }
        ok++
      })
    } catch (err) {
      fail++
      console.error(`[FAIL] ${t.id} ${err.message}`)
    }
  }

  console.log(`=== 回填完成 === 成功：${ok} 跳过(已存在终态)：${skip} 失败：${fail}`)
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
