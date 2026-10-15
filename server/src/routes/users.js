import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { ApiError } from '../utils/apiError.js'
import { ok } from '../utils/respond.js'
import { toUserDTO } from '../utils/dto.js'
import { assert, isEmail } from '../utils/validate.js'
import { DEPT_OPTIONS } from '../constants.js'

const router = Router()
router.use(requireAuth)

const ROLES = ['超级管理员', '部长', '普通员工']

// name/role/dept/email 校验（创建与编辑共用）
const validateProfile = (body) => {
  const name = String(body.name ?? '').trim()
  assert(name, '姓名不能为空')
  assert(name.length <= 50, '姓名过长')
  assert(ROLES.includes(body.role), '角色不合法')
  assert(DEPT_OPTIONS.includes(body.dept), '部门不合法')
  const email = body.email ? String(body.email).trim() : null
  if (email) assert(isEmail(email), '邮箱格式不正确')
  return { name, role: body.role, dept: body.dept, email }
}

const USER_COLS = 'id, username, name, role, dept, email, status, created_at'

// ============ GET /api/users — 用户列表（超管全部 / 部长本部门只读，§0.1 决策 3） ============
router.get('/', requireRole('超级管理员', '部长'), async (req, res) => {
  const params = []
  const { keyword, role, status } = req.query
  let sql = `SELECT ${USER_COLS} FROM users`
  const conds = []
  if (req.user.role === '部长') {
    conds.push(`dept = $${params.length + 1}`)
    params.push(req.user.dept)
  }
  if (keyword) {
    const kw = String(keyword).trim().toLowerCase()
    assert(kw, 'keyword 不合法')
    params.push(`%${kw}%`)
    conds.push(`(lower(username) LIKE $${params.length} OR lower(name) LIKE $${params.length})`)
  }
  if (role) {
    assert(ROLES.includes(role), 'role 不合法')
    params.push(role)
    conds.push(`role = $${params.length}`)
  }
  if (status) {
    assert(['启用', '禁用'].includes(status), 'status 仅支持 启用/禁用')
    params.push(status)
    conds.push(`status = $${params.length}`)
  }
  if (conds.length) sql += ` WHERE ${conds.join(' AND ')}`
  sql += ` ORDER BY created_at ASC, id ASC`
  const { rows } = await query(sql, params)
  ok(res, rows.map(toUserDTO))
})

// ============ GET /api/users/:id — 用户详情（超管任意 / 部长本部门 / 员工仅自己） ============
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id) && id > 0, '用户 ID 不合法')

  // 数据范围：与工单一致的可见性语义，无权一律 404（不暴露存在性）
  const canView =
    req.user.role === '超级管理员' ||
    req.user.id === id ||
    (req.user.role === '部长' && (await isSameDept(req.user.dept, id)))
  assert(canView, '用户不存在', 404)

  const { rows } = await query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id])
  assert(rows[0], '用户不存在', 404)
  ok(res, toUserDTO(rows[0]))
})

// 部长校验目标用户是否同属本部门
async function isSameDept(dept, targetId) {
  const { rows } = await query('SELECT 1 FROM users WHERE id = $1 AND dept = $2', [targetId, dept])
  return rows.length > 0
}

// ============ POST /api/users — 创建用户（仅超管，默认密码 123456） ============
router.post('/', requireRole('超级管理员'), async (req, res) => {
  const body = req.body || {}
  const profile = validateProfile(body)
  const username = String(body.username ?? '').trim().toLowerCase()
  assert(/^[a-z0-9_.-]{2,50}$/.test(username), '用户名仅限小写字母、数字及 _ . -（2-50 位）')
  const password = String(body.password || '123456')
  assert(password.length >= 6, '密码长度不能少于 6 位')
  const hash = await bcrypt.hash(password, 10)

  try {
    const { rows } = await query(
      `INSERT INTO users (username, password_hash, name, role, dept, email)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${USER_COLS}`,
      [username, hash, profile.name, profile.role, profile.dept, profile.email],
    )
    ok(res, toUserDTO(rows[0]), 'ok', 201)
  } catch (err) {
    if (err.code === '23505') throw new ApiError(409, '用户名已存在')
    throw err
  }
})

// ============ PUT /api/users/:id — 编辑（仅超管，username 不可改） ============
router.put('/:id', requireRole('超级管理员'), async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id) && id > 0, '用户 ID 不合法')
  const p = validateProfile(req.body || {})
  const { rows } = await query(
    `UPDATE users SET name = $2, role = $3, dept = $4, email = $5
     WHERE id = $1 RETURNING ${USER_COLS}`,
    [id, p.name, p.role, p.dept, p.email],
  )
  assert(rows[0], '用户不存在', 404)
  ok(res, toUserDTO(rows[0]))
})

// ============ PATCH /api/users/:id/status — 启用/禁用（禁用后已发 token 立即失效） ============
router.patch('/:id/status', requireRole('超级管理员'), async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id) && id > 0, '用户 ID 不合法')
  const { status } = req.body || {}
  assert(['启用', '禁用'].includes(status), 'status 仅支持 启用/禁用')
  if (id === req.user.id && status === '禁用') throw new ApiError(400, '不能禁用当前登录账号')

  const { rows } = await query(
    `UPDATE users SET status = $2 WHERE id = $1 RETURNING ${USER_COLS}`,
    [id, status],
  )
  assert(rows[0], '用户不存在', 404)
  ok(res, toUserDTO(rows[0]))
})

// ============ PATCH /api/users/:id/password — 重置密码为 123456 ============
router.patch('/:id/password', requireRole('超级管理员'), async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id) && id > 0, '用户 ID 不合法')
  const hash = await bcrypt.hash('123456', 10)
  const { rowCount } = await query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, hash])
  assert(rowCount > 0, '用户不存在', 404)
  ok(res, { id })
})

// ============ DELETE /api/users/:id — 删除（有工单引用时 409，引导用禁用） ============
router.delete('/:id', requireRole('超级管理员'), async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id) && id > 0, '用户 ID 不合法')
  if (id === req.user.id) throw new ApiError(400, '不能删除当前登录账号')

  const { rows } = await query(
    `SELECT EXISTS(SELECT 1 FROM orders WHERE submitter_id = $1 OR handler_id = $1) AS has_orders`,
    [id],
  )
  if (rows[0].has_orders) throw new ApiError(409, '该用户存在工单记录，请使用禁用功能')

  const { rowCount } = await query('DELETE FROM users WHERE id = $1', [id])
  assert(rowCount > 0, '用户不存在', 404)
  ok(res, { id })
})

export default router
