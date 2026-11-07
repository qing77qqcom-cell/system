// 组织架构 departments 表 + 种子数据
// 因为 init.sql 已经跑过，单独写 migration 脚本安全追加
// 运行：node server/scripts/seedDepartments.js
import { pool, query } from '../src/db.js'

const deptTree = [
  { id: 1, name: '总公司',        parent_id: null, leader_id: null,  sort: 1 },
  { id: 2, name: '技术部',        parent_id: 1,    leader_id: 2,     sort: 1 },
  { id: 3, name: '研发组',        parent_id: 2,    leader_id: null,  sort: 1 },
  { id: 4, name: '测试组',        parent_id: 2,    leader_id: null,  sort: 2 },
  { id: 5, name: '运维组',        parent_id: 2,    leader_id: null,  sort: 3 },
  { id: 6, name: '市场部',        parent_id: 1,    leader_id: null,  sort: 2 },
  { id: 7, name: '品牌组',        parent_id: 6,    leader_id: null,  sort: 1 },
  { id: 8, name: '销售组',        parent_id: 6,    leader_id: null,  sort: 2 },
  { id: 9, name: '财务部',        parent_id: 1,    leader_id: null,  sort: 3 },
  { id: 10, name: '人事部',       parent_id: 1,    leader_id: null,  sort: 4 },
  { id: 11, name: '行政部',       parent_id: 1,    leader_id: null,  sort: 5 },
]

async function main() {
  console.log('=== departments 初始化 ===')

  // 建表（IF NOT EXISTS 安全）
  await query(`
    CREATE TABLE IF NOT EXISTS departments (
      id           serial PRIMARY KEY,
      name         varchar(80) NOT NULL,
      parent_id    int REFERENCES departments(id) ON DELETE CASCADE,
      leader_id    int REFERENCES users(id) ON DELETE SET NULL,
      sort         int NOT NULL DEFAULT 0,
      status       varchar(10) NOT NULL DEFAULT '启用',
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      UNIQUE(name, parent_id)
    )
  `)
  console.log('✅ 表已就绪')

  // 种子数据（upsert）
  for (const d of deptTree) {
    await query(
      `INSERT INTO departments (id, name, parent_id, leader_id, sort)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name=$2, parent_id=$3, leader_id=$4, sort=$5`,
      [d.id, d.name, d.parent_id, d.leader_id, d.sort]
    )
  }
  await query('SELECT setval(\'departments_id_seq\', GREATEST((SELECT max(id) FROM departments), 1))')
  console.log('✅ 种子已写入')

  // 验证
  const { rows } = await query('SELECT count(*)::int FROM departments')
  console.log(`📊 共 ${rows[0].count} 个部门`)

  await pool.end()
  console.log('=== 完成 ===')
}

main().catch((e) => {
  console.error('❌ 失败:', e.message)
  process.exit(1)
})
