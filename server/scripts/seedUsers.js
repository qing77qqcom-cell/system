// 用户种子数据 + 部门 leader_id 回填
// 覆盖所有 11 个部门，每个部门 1 个 leader + 若干 staff
// 运行：node server/scripts/seedUsers.js
import { query, withTx } from '../src/db.js'
import bcrypt from 'bcryptjs'

const INIT_PWD = '123456'

// 先查当前 departments 结构
const { rows: depts } = await query(`
  SELECT id, name, parent_id FROM departments ORDER BY COALESCE(parent_id,0), id
`)
const deptMap = Object.fromEntries(depts.map(d => [d.name, d.id]))
console.log('📋 部门映射:')
for (const [name, id] of Object.entries(deptMap)) console.log(`  ${name.padEnd(10)} → id=${id}`)

// ========== 设计：部门 → [(username, name, role, dept)] ==========
// admin 不属于任何部门；每个业务部门 1 leader + 若干 staff
const SEED_USERS = [
  // ---- 技术部 ----
  { username: 'leader',    name: '王建国', role: 'leader', dept: '技术部' },  // 已存在
  { username: 'zhangwei',  name: '张威',   role: 'staff',  dept: '研发组' },
  { username: 'liuyang',   name: '刘洋',   role: 'staff',  dept: '研发组' },
  { username: 'chenyun',   name: '陈芸',   role: 'staff',  dept: '测试组' },
  { username: 'zhoupeng',  name: '周鹏',   role: 'staff',  dept: '测试组' },
  { username: 'wubin',     name: '吴斌',   role: 'staff',  dept: '运维组' },

  // ---- 市场部 ----
  { username: 'leader_mkt',  name: '孙丽',   role: 'leader', dept: '市场部' },
  { username: 'huangjing',  name: '黄静',   role: 'staff',  dept: '品牌组' },
  { username: 'xuele',       name: '薛乐',   role: 'staff',  dept: '品牌组' },
  { username: 'caihong',     name: '蔡红',   role: 'staff',  dept: '销售组' },
  { username: 'jiangtao',    name: '姜涛',   role: 'staff',  dept: '销售组' },

  // ---- 财务部 ----
  { username: 'leader_fin',  name: '郑华',   role: 'leader', dept: '财务部' },
  { username: 'masan',       name: '马珊',   role: 'staff',  dept: '财务部' },

  // ---- 人事部 ----
  { username: 'leader_hr',   name: '朱磊',   role: 'leader', dept: '人事部' },
  { username: 'huxia',       name: '胡霞',   role: 'staff',  dept: '人事部' },

  // ---- 行政部 ----
  { username: 'leader_admin', name: '林峰',  role: 'leader', dept: '行政部' },
  { username: 'heting',       name: '何婷',  role: 'staff',  dept: '行政部' },
]

// 过滤掉已存在的（按 username）
const { rows: existing } = await query('SELECT username FROM users')
const existSet = new Set(existing.map(r => r.username))
const toInsert = SEED_USERS.filter(u => !existSet.has(u.username))

console.log(`\n📊 已有用户 ${existing.length} 个，待新增 ${toInsert.length} 个`)

// 批量插入 + 回填 leader_id
await withTx(async (client) => {
  const hash = await bcrypt.hash(INIT_PWD, 10)
  for (const u of toInsert) {
    await client.query(
      `INSERT INTO users (username, password_hash, name, role, dept, email)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (username) DO UPDATE SET name=EXCLUDED.name, role=EXCLUDED.role, dept=EXCLUDED.dept`,
      [u.username, hash, u.name, u.role, u.dept, `${u.username}@oa.com`]
    )
    console.log(`  ✅ ${u.username.padEnd(14)} ${u.name.padEnd(6)} ${u.role.padEnd(7)} → ${u.dept}`)
  }

  // 回填各部门 leader_id（找该部门 role=leader 的第一个人）
  const { rows: allLeaders } = await query(
    `SELECT id, username, dept FROM users WHERE role='leader' AND dept IS NOT NULL`
  )
  for (const l of allLeaders) {
    const deptId = deptMap[l.dept]
    if (deptId) {
      await client.query('UPDATE departments SET leader_id=$1 WHERE id=$2', [l.id, deptId])
      console.log(`  🔗 ${l.dept.padEnd(10)} leader_id → users.${l.id}(${l.username})`)
    }
  }
})

// 最终验证
const { rows: final } = await query(`
  SELECT u.dept, u.role, count(*)::int AS n
  FROM users u WHERE u.dept IS NOT NULL
  GROUP BY u.dept, u.role
  ORDER BY u.dept, u.role
`)
console.log('\n📊 最终各部门人员分布:')
let cur = ''
for (const r of final) {
  if (r.dept !== cur) { console.log(`\n  ${r.dept}`); cur = r.dept }
  console.log(`    ${r.role.padEnd(7)} × ${r.n}`)
}
const { rows: total } = await query('SELECT count(*)::int AS c FROM users')
console.log(`\n✅ 总计 ${total[0].c} 个用户`)
process.exit(0)
