// 用户管理（api-design.md §3：仅超管；全部变更写 audit_logs）
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query, withTx } from '../db.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { ApiError } from '../utils/apiError.js'
import { ok } from '../utils/respond.js'
import { toUserDTO } from '../utils/dto.js'
import { assert, isEmail } from '../utils/validate.js'
import { writeAudit } from '../services/audit.js'
import { ROLES, ROLE_LIST } from '../constants.js'

const router = Router()
router.use(requireAuth, requireRole(ROLES.ADMIN))

const USER_COLS = 'id, username, name, role, dept, email, status, created_at'
const INITIAL_PASSWORD = '123456'

// name/role/dept/email 校验（创建与编辑共用）
const validateProfile = (body) => {
  const name = String(body.name ?? '').trim()
  assert(name, '姓名不能为空')
  assert(name.length <= 50, '姓名过长')
  assert(ROLE_LIST.includes(body.role), '角色不合法')
  const dept = body.dept ? String(body.dept).trim() : null
  // 超级管理员可不属于任何部门，其余角色必须归属部门（数据范围判定依据）
  assert(body.role === ROLES.ADMIN || dept, '部门不能为空')
  const email = body.email ? String(body.email).trim() : null
  if (email) assert(isEmail(email), '邮箱格式不正确')
  return { name, role: body.role, dept: body.role === ROLES.ADMIN ? dept : dept, email }
}

// GET /api/users —— 全量列表（不含密码哈希）
router.get('/', async (req, res) => {
  const { rows } = await query(`SELECT ${USER_COLS} FROM users ORDER BY id`)
  ok(res, rows.map(toUserDTO))
})

// POST /api/users —— 创建；username 唯一 409；初始密码缺省 123456
router.post('/', async (req, res) => {
  const body = req.body || {}
  const profile = validateProfile(body)
  const username = String(body.username ?? '').trim().toLowerCase()
  assert(/^[a-z0-9_.-]{2,50}$/.test(username), '用户名仅限小写字母、数字及 _ . -（2-50 位）')
  const hash = await bcrypt.hash(INITIAL_PASSWORD, 10)

  const user = await withTx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (username, password_hash, name, role, dept, email)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${USER_COLS}`,
      [username, hash, profile.name, profile.role, profile.dept, profile.email],
    ).catch((err) => {
      if (err.code === '23505') throw new ApiError(409, '用户名已存在')
      throw err
    })
    await writeAudit(client, {
      actorId: req.user.id, targetType: 'user', targetId: rows[0].id,
      action: 'create', after: toUserDTO(rows[0]),
    })
    return rows[0]
  })
  ok(res, toUserDTO(user), 'ok', 201)
})

// PUT /api/users/:id —— 改 name/role/dept/email（username 不可改）
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id) && id > 0, '用户 ID 不合法')
  const p = validateProfile(req.body || {})

  const user = await withTx(async (client) => {
    const { rows: before } = await client.query(`SELECT ${USER_COLS} FROM users WHERE id = $1 FOR UPDATE`, [id])
    assert(before[0], '用户不存在', 404)
    const { rows } = await client.query(
      `UPDATE users SET name = $2, role = $3, dept = $4, email = $5, updated_at = now()
        WHERE id = $1 RETURNING ${USER_COLS}`,
      [id, p.name, p.role, p.dept, p.email],
    )
    await writeAudit(client, {
      actorId: req.user.id, targetType: 'user', targetId: id,
      action: 'update', before: toUserDTO(before[0]), after: toUserDTO(rows[0]),
    })
    return rows[0]
  })
  ok(res, toUserDTO(user))
})

// PATCH /api/users/:id/status —— { status:'启用'|'禁用'|'锁定' }；禁用/锁定即时失效
router.patch('/:id/status', async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id) && id > 0, '用户 ID 不合法')
  const { status } = req.body || {}
  assert(['启用', '禁用', '锁定'].includes(status), 'status 仅支持 启用/禁用/锁定')
  if (id === req.user.id && status !== '启用') throw new ApiError(400, '不能禁用或锁定当前登录账号')

  const user = await withTx(async (client) => {
    const { rows: before } = await client.query(`SELECT ${USER_COLS} FROM users WHERE id = $1 FOR UPDATE`, [id])
    assert(before[0], '用户不存在', 404)
    const { rows } = await client.query(
      `UPDATE users SET status = $2, updated_at = now() WHERE id = $1 RETURNING ${USER_COLS}`,
      [id, status],
    )
    await writeAudit(client, {
      actorId: req.user.id, targetType: 'user', targetId: id,
      action: 'update_status', before: { status: before[0].status }, after: { status },
    })
    return rows[0]
  })
  ok(res, toUserDTO(user))
})

// PATCH /api/users/:id/password —— 重置为 123456
router.patch('/:id/password', async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id) && id > 0, '用户 ID 不合法')
  const hash = await bcrypt.hash(INITIAL_PASSWORD, 10)
  await withTx(async (client) => {
    const { rowCount } = await client.query(
      'UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [id, hash])
    assert(rowCount > 0, '用户不存在', 404)
    await writeAudit(client, {
      actorId: req.user.id, targetType: 'user', targetId: id, action: 'reset_password',
    })
  })
  ok(res, { id })
})

// DELETE /api/users/:id —— 名下有工单 → 409 提示改用禁用
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id) && id > 0, '用户 ID 不合法')
  if (id === req.user.id) throw new ApiError(400, '不能删除当前登录账号')

  await withTx(async (client) => {
    const { rows: before } = await client.query(`SELECT ${USER_COLS} FROM users WHERE id = $1 FOR UPDATE`, [id])
    assert(before[0], '用户不存在', 404)
    const { rows } = await client.query(
      `SELECT EXISTS(
         SELECT 1 FROM tickets WHERE applicant_id = $1 OR current_handler_id = $1
       ) AS has_tickets`,
      [id],
    )
    if (rows[0].has_tickets) throw new ApiError(409, '该用户名下存在工单，请改用禁用')
    await client.query('DELETE FROM users WHERE id = $1', [id])
    await writeAudit(client, {
      actorId: req.user.id, targetType: 'user', targetId: id,
      action: 'delete', before: toUserDTO(before[0]),
    })
  })
  ok(res, { id })
})

export default router
