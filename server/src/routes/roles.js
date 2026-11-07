// 角色与权限管理（仅超管）
// - roles 表：角色母体（code 唯一，users.role 引用）
// - role_permissions 表：角色拥有的权限码（perm_code 唯一索引 role+perm_code）
//
// 权限码字典：前端和后端共享下面 PERM_CODES（菜单权限 + 按钮权限）
import { Router } from 'express'
import { query, withTx } from '../db.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { ok } from '../utils/respond.js'
import { ApiError } from '../utils/apiError.js'
import { assert } from '../utils/validate.js'
import { ROLES, ROLE_LIST } from '../constants.js'

const router = Router()
router.use(requireAuth, requireRole(ROLES.ADMIN))

const assertRoleCode = (code) => {
  assert(code && typeof code === 'string', '角色编码不能为空')
  assert(/^[a-z][a-z0-9_]{1,30}$/.test(code), '角色编码仅限小写字母/数字/下划线（2-30 位）')
}

// ============== 角色 CRUD ==============

// GET /api/roles —— 列表（不含密码，不带权限）
router.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, code, name, description, sort, active, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM roles ORDER BY sort ASC, id ASC`,
  )
  ok(res, rows)
})

// POST /api/roles —— 新增
router.post('/', async (req, res) => {
  const body = req.body || {}
  const code = String(body.code ?? '').trim().toLowerCase()
  const name = String(body.name ?? '').trim()
  assertRoleCode(code)
  assert(name, '角色名称不能为空')

  const { rows: exist } = await query('SELECT id FROM roles WHERE code = $1', [code])
  if (exist[0]) throw new ApiError(409, '角色编码已存在')

  const { rows } = await query(
    `INSERT INTO roles (code, name, description, sort, active)
     VALUES ($1, $2, $3, $4, COALESCE($5, true))
     RETURNING id, code, name, description, sort, active, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [code, name, body.description || null, body.sort ?? 99, body.active !== false],
  )
  ok(res, rows[0], 'ok', 201)
})

// PUT /api/roles/:id —— 编辑（code 不可改，改了会断关联）
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id) && id > 0, '角色 ID 不合法')
  const body = req.body || {}
  const name = String(body.name ?? '').trim()
  assert(name, '角色名称不能为空')

  const { rows } = await query(
    `UPDATE roles SET name = $2, description = $3, sort = $4, active = COALESCE($5, active), updated_at = now()
     WHERE id = $1 RETURNING id, code, name, description, sort, active, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [id, name, body.description || null, body.sort ?? 99, body.active],
  )
  assert(rows[0], '角色不存在', 404)
  ok(res, rows[0])
})

// DELETE /api/roles/:id —— 删除（users 表里还有引用 → 409）
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id) && id > 0, '角色 ID 不合法')

  await withTx(async (client) => {
    const { rows: role } = await client.query('SELECT id, code FROM roles WHERE id = $1', [id])
    assert(role[0], '角色不存在', 404)
    // 内置三角色禁删
    if ([ROLES.ADMIN, ROLES.LEADER, ROLES.STAFF].includes(role[0].code)) {
      throw new ApiError(400, '内置角色禁止删除')
    }
    const { rows: refs } = await client.query('SELECT count(*)::int AS c FROM users WHERE role = $1', [role[0].code])
    if (refs[0].c > 0) throw new ApiError(409, `还有 ${refs[0].c} 个用户持有该角色，请先调岗`)

    await client.query('DELETE FROM role_permissions WHERE role = $1', [role[0].code])
    await client.query('DELETE FROM roles WHERE id = $1', [id])
  })
  ok(res, { id })
})

// ============== 角色权限 ==============

// GET /api/roles/:id/permissions —— 某角色当前权限码列表
router.get('/:id/permissions', async (req, res) => {
  const id = Number(req.params.id)
  const { rows: role } = await query('SELECT id, code, name FROM roles WHERE id = $1', [id])
  assert(role[0], '角色不存在', 404)
  const { rows: perms } = await query(
    'SELECT perm_code AS "permCode" FROM role_permissions WHERE role = $1 ORDER BY perm_code',
    [role[0].code],
  )
  ok(res, { role: role[0], permissions: perms.map((p) => p.permCode) })
})

// PUT /api/roles/:id/permissions —— 覆盖式保存（前端传全量数组）
router.put('/:id/permissions', async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id) && id > 0, '角色 ID 不合法')
  const { permissions } = req.body || {}
  assert(Array.isArray(permissions), 'permissions 必须是数组')

  const role = (await query('SELECT id, code FROM roles WHERE id = $1', [id])).rows[0]
  assert(role, '角色不存在', 404)

  await withTx(async (client) => {
    await client.query('DELETE FROM role_permissions WHERE role = $1', [role.code])
    if (permissions.length) {
      await client.query(
        `INSERT INTO role_permissions (role, perm_code) VALUES ${permissions.map((_, i) => `($1, $${i + 2})`).join(', ')}`,
        [role.code, ...permissions],
      )
    }
  })
  ok(res, { roleCode: role.code, count: permissions.length })
})

// ============== 权限码字典 ==============

/**
 * 所有可配置的权限码（菜单权限 + 按钮权限）
 * 前端角色权限配置页面从这里读，而非从 role_permissions 反推
 *
 * 层级：group（功能模块） → key（权限码）→ label（显示名）→ type（menu/button）
 */
export const PERMISSION_CATALOG = [
  // —— 系统设置（admin 专属菜单）——
  {
    group: '系统设置',
    items: [
      { key: 'menu:system-config',  label: '系统设置（一级）', type: 'menu' },
      { key: 'menu:user-manage',    label: '→ 用户管理', type: 'menu' },
      { key: 'menu:dept-control',  label: '→ 组织架构', type: 'menu' },
      { key: 'menu:role-control',   label: '→ 角色与权限', type: 'menu' },
      { key: 'menu:approval-flow',  label: '→ 审批流程', type: 'menu' },
      { key: 'menu:sla-config',     label: '→ SLA 时效配置', type: 'menu' },
      { key: 'menu:login-log',      label: '→ 登录日志', type: 'menu' },
      { key: 'menu:logs',           label: '→ 操作日志', type: 'menu' },
    ],
  },

  // —— 工作台 / 工单 ——
  {
    group: '工作台 · 工单',
    items: [
      { key: 'menu:workbench', label: '工作台（一级）', type: 'menu' },
      { key: 'menu:todo',      label: '→ 通知待办', type: 'menu' },
      { key: 'menu:stats',     label: '→ 数据分析', type: 'menu' },
      { key: 'menu:tickets',   label: '→ 工单列表', type: 'menu' },
    ],
  },

  // —— 审批中心 ——
  {
    group: '审批中心',
    items: [
      { key: 'menu:approval-center', label: '审批中心', type: 'menu' },
      { key: 'menu:team-manage',    label: '团队管理', type: 'menu' },
    ],
  },

  // —— 工单创建 ——
  {
    group: '工单创建',
    items: [
      { key: 'menu:work-order-create', label: '工单创建', type: 'menu' },
      { key: 'menu:drafts',            label: '草稿箱', type: 'menu' },
      { key: 'menu:help',              label: '帮助中心', type: 'menu' },
    ],
  },

  // —— 按钮权限 ——
  {
    group: '按钮权限',
    items: [
      // 用户管理
      { key: 'user:create',   label: '用户管理 · 新增用户', type: 'button' },
      { key: 'user:edit',     label: '用户管理 · 编辑用户', type: 'button' },
      { key: 'user:disable',  label: '用户管理 · 启禁用户', type: 'button' },
      { key: 'user:delete',   label: '用户管理 · 删除用户', type: 'button' },
      { key: 'user:reset-pwd', label: '用户管理 · 重置密码', type: 'button' },
      // 工单
      { key: 'ticket:create',    label: '工单 · 提交工单', type: 'button' },
      { key: 'ticket:approve',   label: '工单 · 审批工单', type: 'button' },
      { key: 'ticket:handle',    label: '工单 · 处理工单', type: 'button' },
      { key: 'ticket:close',     label: '工单 · 关闭工单', type: 'button' },
      { key: 'ticket:escalate',  label: '工单 · 升级/转办', type: 'button' },
      { key: 'ticket:delete',    label: '工单 · 删除工单', type: 'button' },
      // 流程与规则
      { key: 'flow:edit',    label: '审批流程 · 编辑流程', type: 'button' },
      { key: 'sla:edit',     label: 'SLA · 编辑规则', type: 'button' },
      { key: 'sla:calendar', label: 'SLA · 工作日历', type: 'button' },
      // 日志
      { key: 'log:export',   label: '日志 · 导出 CSV', type: 'button' },
    ],
  },
]

// GET /api/permission-codes —— 前端渲染权限配置页的字典
router.get('/permission-codes', (_req, res) => {
  ok(res, { groups: PERMISSION_CATALOG })
})

export default router
