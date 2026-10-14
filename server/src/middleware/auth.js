import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { query } from '../db.js'
import { ApiError } from '../utils/apiError.js'

// 认证中间件：校验 Bearer token，并回查用户状态（禁用立即失效）
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) {
    throw new ApiError(401, '未登录或登录已过期')
  }
  let payload
  try {
    payload = jwt.verify(header.slice(7), config.jwtSecret)
  } catch {
    throw new ApiError(401, '未登录或登录已过期')
  }

  // 每次请求回查数据库：用户被删除/禁用后旧 token 立即失效
  const { rows } = await query(
    `SELECT id, username, name, role, dept, email, status, created_at
       FROM users WHERE id = $1`,
    [payload.uid],
  )
  const user = rows[0]
  if (!user || user.status !== '启用') {
    throw new ApiError(401, '账号不可用，请重新登录')
  }

  req.user = user
  next()
}

// 角色授权中间件工厂：requireRole('超级管理员')
export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      throw new ApiError(403, '没有权限执行此操作')
    }
    next()
  }
