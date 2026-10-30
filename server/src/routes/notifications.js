// 站内通知（api-design.md §6）
import { Router } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { ok } from '../utils/respond.js'
import { assert } from '../utils/validate.js'
import { formatDateTime } from '../utils/datetime.js'

const router = Router()
router.use(requireAuth)

// GET /api/notifications —— 我的站内通知（未读优先，同组按时间升序）
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT id, ticket_id AS "ticketId", kind, title, content,
            read_at AS "readAt", created_at AS "createdAt"
       FROM notifications
      WHERE recipient_id = $1
      ORDER BY (read_at IS NULL) DESC, created_at DESC, id DESC`,
    [req.user.id],
  )
  ok(res, rows.map((r) => ({
    ...r,
    readAt: formatDateTime(r.readAt),
    createdAt: formatDateTime(r.createdAt),
  })))
})

// PATCH /api/notifications/read-all —— 全部已读（注意注册在 /:id/read 之前）
router.patch('/read-all', async (req, res) => {
  const { rowCount } = await query(
    'UPDATE notifications SET read_at = now() WHERE recipient_id = $1 AND read_at IS NULL',
    [req.user.id],
  )
  ok(res, { count: rowCount })
})

// PATCH /api/notifications/:id/read —— 标记已读（仅本人通知，越权 404）
router.patch('/:id/read', async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id), 'ID 不合法')
  const { rowCount } = await query(
    'UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND recipient_id = $2',
    [id, req.user.id],
  )
  assert(rowCount > 0, '通知不存在', 404)
  ok(res, { id })
})

export default router
