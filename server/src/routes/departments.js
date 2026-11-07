// 组织架构 departments
import { Router } from 'express'
import { query, withTx } from '../db.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { assert } from '../utils/validate.js'
import { ok } from '../utils/respond.js'
import { ROLES } from '../constants.js'

const router = Router()
router.use(requireAuth)
const needAdmin = requireRole(ROLES.ADMIN)

const COLS = 'id, name, parent_id AS "parentId", leader_id AS "leaderId", sort, status, created_at AS "createdAt", updated_at AS "updatedAt"'

// GET /api/departments —— 全量列表（前端自己组树，后端返回扁平数组 + 成员数）
// memberCount = 直接挂载用户 + 所有子孙部门的用户（递归 CTE 一次算完）
router.get('/', async (req, res) => {
  const withMembers = req.query.with_members !== 'false'

  // 1. 先算每个部门的递归用户数（含自己 + 所有子孙）
  const { rows: counts } = await query(`
    WITH RECURSIVE ancestor AS (
      -- 起点：自己
      SELECT id, name, id AS root_id
      FROM departments
      UNION ALL
      -- 递归：把 parent_id 指向 root_id 的全部子孙
      SELECT d.id, d.name, a.root_id
      FROM departments d
      JOIN ancestor a ON d.parent_id = a.id
    )
    SELECT a.root_id AS dept_id, count(u.id)::int AS "memberCount"
    FROM ancestor a
    LEFT JOIN users u ON u.dept = a.name
    GROUP BY a.root_id
  `)
  const countMap = new Map(counts.map((c) => [c.dept_id, c.memberCount]))

  // 2. 查部门基础信息，memberCount 从 countMap 拿
  const { rows } = await query(
    `SELECT ${COLS} FROM departments d ORDER BY d.parent_id NULLS FIRST, d.sort, d.id`
  )
  for (const r of rows) {
    r.memberCount = countMap.get(r.id) || 0
  }

  if (withMembers) {
    // 一次性拿所有用户，前端按 dept 分组（直接挂载的成员列表）
    const { rows: users } = await query('SELECT id, username, name, role, dept, status FROM users ORDER BY id')
    for (const r of rows) {
      r.members = users.filter((u) => u.dept === r.name)
    }
  }
  ok(res, rows)
})

// POST /api/departments —— 新增
router.post('/', needAdmin, async (req, res) => {
  const { name, parentId, leaderId, sort } = req.body || {}
  const cleanName = String(name ?? '').trim()
  assert(cleanName, '部门名称不能为空')
  assert(cleanName.length <= 80, '部门名称过长')

  const parentCheck = parentId ? await query('SELECT id FROM departments WHERE id=$1', [parentId]) : { rows: [] }
  assert(!parentId || parentCheck.rows[0], '上级部门不存在', 400)

  const { rows } = await query(
    `INSERT INTO departments (name, parent_id, leader_id, sort)
     VALUES ($1, $2, $3, $4) RETURNING ${COLS}`,
    [cleanName, parentId || null, leaderId || null, sort ?? 0]
  ).catch((err) => {
    if (err.code === '23505') throw new Error('同级部门名称已存在')
    throw err
  })
  ok(res, rows[0], 'ok', 201)
})

// PUT /api/departments/:id —— 编辑
router.put('/:id', needAdmin, async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id) && id > 0, '部门 ID 不合法')

  const { name, parentId, leaderId, sort, status } = req.body || {}
  const { rows: before } = await query(`SELECT ${COLS} FROM departments WHERE id=$1`, [id])
  assert(before[0], '部门不存在', 404)

  // 不能把父级设成自己或自己的后代（防环）
  if (parentId && parentId !== before[0].parentId) {
    const descendants = await query(
      `WITH RECURSIVE t AS (SELECT id FROM departments WHERE parent_id=$1 UNION ALL SELECT d.id FROM departments d JOIN t ON d.parent_id=t.id)
       SELECT count(*) AS c FROM t WHERE id=$2`,
      [id, parentId]
    )
    assert(descendants.rows[0].c === 0, '不能将部门移动到其下属部门之下')
  }

  const newName = String(name ?? before[0].name).trim()
  const newParentId = parentId === undefined ? before[0].parentId : (parentId || null)
  const newLeaderId = leaderId === undefined ? before[0].leaderId : (leaderId || null)
  const newSort = sort ?? before[0].sort
  const newStatus = status ?? before[0].status

  const { rows } = await query(
    `UPDATE departments SET name=$1, parent_id=$2, leader_id=$3, sort=$4, status=$5, updated_at=now()
     WHERE id=$6 RETURNING ${COLS}`,
    [newName, newParentId, newLeaderId, newSort, newStatus, id]
  ).catch((err) => {
    if (err.code === '23505') throw new Error('同级部门名称已存在')
    throw err
  })

  // 如果部门名称变了，users.dept 里的字符串也要同步
  if (newName !== before[0].name) {
    await query('UPDATE users SET dept=$1 WHERE dept=$2', [newName, before[0].name])
    await query('UPDATE tickets SET dept=$1 WHERE dept=$2', [newName, before[0].name])
  }

  ok(res, rows[0])
})

// DELETE /api/departments/:id —— 删除（有子部门或成员 → 拒绝）
router.delete('/:id', needAdmin, async (req, res) => {
  const id = Number(req.params.id)
  assert(Number.isInteger(id) && id > 0, '部门 ID 不合法')

  await withTx(async (client) => {
    const { rows: before } = await client.query(`SELECT ${COLS} FROM departments WHERE id=$1 FOR UPDATE`, [id])
    assert(before[0], '部门不存在', 404)

    // 检查子部门
    const { rows: children } = await client.query('SELECT count(*) AS c FROM departments WHERE parent_id=$1', [id])
    assert(Number(children[0].c) === 0, `该部门下还有 ${children[0].c} 个子部门，请先处理`, 400)

    // 检查成员
    const { rows: members } = await client.query('SELECT count(*) AS c FROM users WHERE dept=$1', [before[0].name])
    assert(Number(members[0].c) === 0, `该部门还有 ${members[0].c} 名成员，请先调动或删除`, 400)

    await client.query('DELETE FROM departments WHERE id=$1', [id])
  })
  ok(res, { id })
})

export default router
