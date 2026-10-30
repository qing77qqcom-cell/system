import pg from 'pg'
import { config } from './config.js'

// ssl 配置：仅托管数据库（Neon/Supabase 等）需要；本地 Docker PostgreSQL 必须关闭
// 通过 .env 的 DB_SSL=on/off 控制；缺省时根据 URL 是否含 sslmode 参数推断
const url = config.databaseUrl || ''
const sslOn =
  process.env.DB_SSL === 'on' ||
  (process.env.DB_SSL !== 'off' && /sslmode=require/i.test(url))

export const pool = new pg.Pool({
  connectionString: url,
  ...(sslOn ? { ssl: { rejectUnauthorized: false } } : {}),
  max: 10,
})

// 会话级时区统一为东八区，保证数据库侧日期函数与业务时区一致
pool.on('connect', (client) => {
  client.query("SET timezone = 'Asia/Shanghai'")
})

export const query = (text, params) => pool.query(text, params)

export const checkDb = async () => {
  await pool.query('SELECT 1')
}

// 事务包装：fn 内抛错自动回滚
export const withTx = async (fn) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
