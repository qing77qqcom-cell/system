import pg from 'pg'
import { config } from './config.js'

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: { rejectUnauthorized: false }, // Neon 托管要求 SSL
  max: 5, // 免费实例连接数有限，控制池大小
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
