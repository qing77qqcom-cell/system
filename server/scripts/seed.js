// 演示账号初始化脚本（幂等：已存在的 username 跳过，不会覆盖密码）
// 与前端 SEED_USERS 一一对应；统一初始密码 123456（bcrypt 哈希后入库）
import bcrypt from 'bcryptjs'
import { pool } from '../src/db.js'

// 与前端 src/mock/users.js 的 SEED_USERS 保持一致
const USERS = [
  { username: 'admin', name: '系统管理员', role: '超级管理员', dept: '技术部', email: 'admin@oa.com', status: '启用', createdAt: '2026-01-01 09:00' },
  { username: 'manager', name: '李部长', role: '部长', dept: '技术部', email: 'libu@oa.com', status: '启用', createdAt: '2026-01-02 09:00' },
  { username: 'lisi', name: '李四', role: '部长', dept: '技术部', email: 'lisi@oa.com', status: '启用', createdAt: '2026-01-03 09:00' },
  { username: 'zhoujiu', name: '周九', role: '部长', dept: '人事部', email: 'zhoujiu@oa.com', status: '启用', createdAt: '2026-01-04 09:00' },
  { username: 'zhangsan', name: '张三', role: '普通员工', dept: '技术部', email: 'zhangsan@oa.com', status: '启用', createdAt: '2026-01-05 09:00' },
  { username: 'wangwu', name: '王五', role: '普通员工', dept: '市场部', email: 'wangwu@oa.com', status: '启用', createdAt: '2026-01-06 09:00' },
  { username: 'zhaoliu', name: '赵六', role: '普通员工', dept: '行政部', email: 'zhaoliu@oa.com', status: '启用', createdAt: '2026-01-07 09:00' },
  { username: 'qianqi', name: '钱七', role: '普通员工', dept: '财务部', email: 'qianqi@oa.com', status: '启用', createdAt: '2026-01-08 09:00' },
  { username: 'sunba', name: '孙八', role: '普通员工', dept: '人事部', email: 'sunba@oa.com', status: '启用', createdAt: '2026-01-09 09:00' },
  { username: 'wushi', name: '吴十', role: '普通员工', dept: '市场部', email: 'wushi@oa.com', status: '禁用', createdAt: '2026-01-10 09:00' },
  { username: 'zhengshiyi', name: '郑十一', role: '普通员工', dept: '行政部', email: 'zhengshiyi@oa.com', status: '启用', createdAt: '2026-01-11 09:00' },
  { username: 'fengshier', name: '冯十二', role: '普通员工', dept: '技术部', email: 'fengshier@oa.com', status: '禁用', createdAt: '2026-01-12 09:00' },
]

const hash = await bcrypt.hash('123456', 10)

try {
  let inserted = 0
  for (const u of USERS) {
    const { rowCount } = await pool.query(
      `INSERT INTO users (username, password_hash, name, role, dept, email, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, ($8 || '+08')::timestamptz)
       ON CONFLICT (username) DO NOTHING`,
      [u.username, hash, u.name, u.role, u.dept, u.email, u.status, u.createdAt],
    )
    inserted += rowCount
  }
  console.log(`种子用户完成：新增 ${inserted} 个，跳过 ${USERS.length - inserted} 个（已存在）`)
  console.log('演示账号（初始密码均为 123456）：')
  console.log('  超级管理员  admin')
  console.log('  部长        manager / lisi / zhoujiu')
  console.log('  普通员工    zhangsan / wangwu / zhaoliu / qianqi / sunba（wushi、fengshier 已禁用）')
} catch (err) {
  console.error('种子写入失败：', err.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
