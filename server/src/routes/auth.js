import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { query, withTx } from '../db.js'
import { ok } from '../utils/respond.js'
import { ApiError } from '../utils/apiError.js'
import { assert } from '../utils/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { toUserDTO } from '../utils/dto.js'

const router = Router()

// 系统参数读取（无缓存，配置即时生效）
const getParam = async (key, fallback) => {
  const { rows } = await query('SELECT value FROM system_params WHERE key = $1', [key])
  return rows[0] ? rows[0].value : fallback
}

const writeLoginLog = (client, { userId, username, success, req }) =>
  client.query(
    `INSERT INTO login_logs (user_id, username, success, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, username, success, req.ip || null, req.headers['user-agent'] || null],
  )

// POST /api/login —— 登录（成功/失败均写 login_logs；连续失败达阈值自动锁定）
router.post('/login', async (req, res) => {
  const { username, password, remember } = req.body || {}
  assert(typeof username === 'string' && username.trim(), '请输入账号')
  assert(typeof password === 'string' && password, '请输入密码')
  const uname = username.trim().toLowerCase()

  const { rows } = await query('SELECT * FROM users WHERE username = $1', [uname])
  const user = rows[0]

  // 账号不存在：按文档失败同样留痕（user_id 置空）
  if (!user) {
    await query(
      `INSERT INTO login_logs (user_id, username, success, ip, user_agent)
       VALUES (NULL, $1, false, $2, $3)`,
      [uname, req.ip || null, req.headers['user-agent'] || null],
    )
    throw new ApiError(401, '账号或密码错误')
  }

  if (user.status !== '启用') {
    await writeLoginLog(query, { userId: user.id, username: uname, success: false, req })
    throw new ApiError(403, '账号已禁用或锁定')
  }

  const passOk = await bcrypt.compare(password, user.password_hash)
  if (!passOk) {
    const maxRetry = Number(await getParam('login_max_retry', 5))
    await withTx(async (client) => {
      await writeLoginLog(client, { userId: user.id, username: uname, success: false, req })
      // 连续失败次数 = 最近一次成功之后的失败记录数
      const { rows: r } = await client.query(
        `SELECT count(*)::int AS fails FROM login_logs
          WHERE username = $1 AND success = false
            AND created_at > COALESCE(
              (SELECT max(created_at) FROM login_logs WHERE username = $1 AND success = true),
              '-infinity')`,
        [uname],
      )
      if (r[0].fails >= maxRetry) {
        await client.query(`UPDATE users SET status = '锁定', updated_at = now() WHERE id = $1`, [user.id])
      }
    })
    throw new ApiError(401, '账号或密码错误')
  }

  await writeLoginLog(query, { userId: user.id, username: uname, success: true, req })

  const expiresIn = remember ? config.jwtExpiresRemember : config.jwtExpires
  const token = jwt.sign({ uid: user.id, username: user.username, role: user.role }, config.jwtSecret, { expiresIn })
  ok(res, { token, user: toUserDTO(user) })
})

// GET /api/users/me —— 当前登录用户（刷新恢复登录态）
router.get('/users/me', requireAuth, (req, res) => {
  ok(res, toUserDTO(req.user))
})

export default router
