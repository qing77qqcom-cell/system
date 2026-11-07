// 角色体系重构：roles 母体表 + users.role 引用 role_code + role_permissions 关联 role_code
// 三种角色：admin(超级管理员) / leader(部门部长) / staff(普通员工)
// 映射：超级管理员→admin, 技术部部长→leader, 技术部普通员工→staff
// 运行：node server/scripts/migrateRoles.js
import { pool, query } from '../src/db.js'

const OLD_TO_NEW = {
  '超级管理员': 'admin',
  '技术部部长': 'leader',
  '技术部普通员工': 'staff',
}
const ROLES = [
  { code: 'admin',  name: '超级管理员', description: '拥有系统全部权限，可管理用户、部门、流程、SLA 等所有配置',        sort: 1 },
  { code: 'leader', name: '部门部长',   description: '管理本部门工单，可审批、分配、处理，数据范围限定本部门',         sort: 2 },
  { code: 'staff',  name: '普通员工',   description: '可提交工单、处理分配给自己的工单，数据范围限定自己',             sort: 3 },
]

async function main() {
  console.log('=== 角色体系重构 ===')

  // 1. 建 roles 母体表
  await query(`
    CREATE TABLE IF NOT EXISTS roles (
      id           serial PRIMARY KEY,
      code         varchar(30) NOT NULL UNIQUE,
      name         varchar(50) NOT NULL UNIQUE,
      description  text,
      sort         int NOT NULL DEFAULT 0,
      active       boolean NOT NULL DEFAULT true,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now()
    )
  `)
  console.log('✅ roles 表就绪')

  // 2. 种子（upsert）
  for (const r of ROLES) {
    await query(
      `INSERT INTO roles (code, name, description, sort) VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET name=$2, description=$3, sort=$4`,
      [r.code, r.name, r.description, r.sort]
    )
  }
  await query('SELECT setval(\'roles_id_seq\', GREATEST((SELECT max(id) FROM roles), 1))')
  console.log('✅ 3 个角色种子已写入')

  // 3. 迁移 users.role：旧中文值 → 新 role_code
  //    先删 CHECK 约束（旧的 role IN (...) 约束），改完再加
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS backup_role varchar(50)`)
  // 删除 role 列的 CHECK 约束（名字可能是 users_role_check 或自动生成的）
  const { rows: cons } = await query(`SELECT conname FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%role%'`)
  for (const c of cons) {
    await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS ${c.conname}`)
    console.log(`   已删除约束 ${c.conname}`)
  }
  for (const [oldVal, newVal] of Object.entries(OLD_TO_NEW)) {
    await query('UPDATE users SET backup_role = role WHERE role = $1 AND backup_role IS NULL', [oldVal])
    await query('UPDATE users SET role = $1 WHERE role = $2', [newVal, oldVal])
  }
  // 加新 CHECK 约束
  await query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','leader','staff'))`)
  const { rows: users } = await query('SELECT role, count(*)::int AS c FROM users GROUP BY role ORDER BY role')
  console.log('✅ users.role 已迁移：', users.map(r => `${r.role}(${r.c})`).join(', '))

  // 4. 重建 role_permissions：role 列改为 role_code（与 roles.code 关联）
  //    先备份旧表 → 清空 → 按 OLD_TO_NEW 重写
  await query(`CREATE TABLE IF NOT EXISTS role_permissions_bak AS TABLE role_permissions WITH NO DATA`)
  const { rows: bak } = await query('SELECT count(*)::int AS c FROM role_permissions_bak')
  if (bak[0].c === 0) {
    // 第一次迁移：先把原始数据备份进去
    await query('INSERT INTO role_permissions_bak SELECT * FROM role_permissions')
    console.log('✅ role_permissions 已备份')
  }

  // 迁移 role_permissions.role → role_code
  for (const [oldVal, newVal] of Object.entries(OLD_TO_NEW)) {
    await query('UPDATE role_permissions SET role = $1 WHERE role = $2', [newVal, oldVal])
  }
  const { rows: perms } = await query('SELECT role, count(*)::int AS c FROM role_permissions GROUP BY role ORDER BY role')
  console.log('✅ role_permissions 已迁移：', perms.map(r => `${r.role}(${r.c})`).join(', '))

  // 5. 验证
  const { rows: roles } = await query('SELECT code, name FROM roles ORDER BY sort')
  console.log('\n📊 roles 表内容：')
  for (const r of roles) console.log(`   ${r.code.padEnd(10)} ${r.name}`)

  await pool.end()
  console.log('\n=== 迁移完成 ===')
}

main().catch((e) => { console.error('❌ 失败:', e.message); process.exit(1) })
