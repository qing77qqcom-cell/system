// 建表脚本：执行 sql/init.sql（幂等，可重复运行）
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pool } from '../src/db.js'

const sqlPath = fileURLToPath(new URL('../sql/init.sql', import.meta.url))
const sql = readFileSync(sqlPath, 'utf-8')

try {
  await pool.query(sql)
  console.log('建表完成：users / orders / order_logs 及索引已就绪')
} catch (err) {
  console.error('建表失败：', err.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
