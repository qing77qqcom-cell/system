import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { query } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { ApiError } from '../utils/apiError.js'
import { ok } from '../utils/respond.js'
import { toUserDTO } from '../utils/dto.js'

const router = Router()

// POST /api/login — 登录
router.post('/login', async (req, res) => {
  const { username, password, remember } = req.body || {}
  if (!username || !password) {
    throw new ApiError(400, '账号和密码不能为空')
  }

  // username 归一化后查询（库内存量数据均为小写）
  const name = String(username).trim().toLowerCase()
  const { rows } = await query(
    'SELECT id, username, name, role, dept, email, status, password_hash, created_at FROM users WHERE lower(username) = $1',
    [name],
  )
  const user = rows[0]

  // 账号不存在与密码错误统一返回 401，不暴露账号是否存在
  const valid = user ? await bcrypt.compare(String(password), user.password_hash) : false
  if (!valid) throw new ApiError(401, '账号或密码错误')
  if (user.status !== '启用') throw new ApiError(403, '账号已被禁用，请联系管理员')

  const token = jwt.sign(
    { uid: user.id, username: user.username, name: user.name, role: user.role, dept: user.dept },
    config.jwtSecret,
    { expiresIn: remember ? config.jwtExpiresRemember : config.jwtExpires },
  )

  ok(res, { token, user: toUserDTO(user) })
})

// GET /api/users/me — 当前用户信息（刷新页面后恢复用户态）
router.get('/users/me', requireAuth, (req, res) => {
  ok(res, toUserDTO(req.user))
})

export default router
