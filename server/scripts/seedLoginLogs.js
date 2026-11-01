/**
 * seedLoginLogs.js —— 往 login_logs 造测试数据
 *
 * 用法：node server/scripts/seedLoginLogs.js [数量，默认500] [--append]
 *   默认先清空 login_logs 再插入；--append 则追加不删
 *
 * 生成规则：
 *   - 3 个真实用户（admin/leader/staff）+ 17 个虚拟账号
 *   - success 随机 85% 成功、15% 失败（模拟真实登录失败率）
 *   - 时间跨度：过去 30 天内随机分布
 *   - ip 从 3 段内网网段 + 少量公网 IP 随机
 *   - user_agent 覆盖 Chrome / Safari / Edge / Firefox / 手机端
 */

import { pool } from '../src/db.js'

const args = process.argv.slice(2)
const countArg = args.find((a) => !a.startsWith('-'))
const totalCount = Math.min(Number(countArg) || 500, 5000) // 上限 5000 防手滑
const append = args.includes('--append')

// —— 数据源 ——

const REAL_USERS = [
  { id: 1, username: 'admin', name: '陈超' },
  { id: 2, username: 'leader', name: '王建国' },
  { id: 3, username: 'staff', name: '李晓' },
  { id: 4, username: 'staff2', name: '赵敏' },
]

// 不存在的账号（模拟登录失败）
const FAKE_USERNAMES = ['zhangsan', 'lisi', 'wangwu', 'guest', 'root', 'test', 'hacker', 'temp', 'demo', 'backup']

// 真实 user 的 username + 虚拟失败账号
const ALL_USERNAMES = [
  ...REAL_USERS.map((u) => ({ ...u, userId: u.id, loginable: true })),
  ...FAKE_USERNAMES.map((n) => ({ id: null, username: n, name: null, loginable: false })),
]

const IP_POOL = [
  // 内网网段（高频）
  ...Array.from({ length: 60 }, (_, i) => `10.0.1.${10 + i}`),
  ...Array.from({ length: 40 }, (_, i) => `192.168.1.${100 + i}`),
  // 公网（低频）
  '114.82.33.156', '223.104.63.88', '120.36.211.45', '183.15.224.9', '101.6.12.88',
  '211.162.37.10', '153.127.1.88', '202.96.128.86', '61.165.173.4', '58.22.1.99',
]

const USER_AGENTS = [
  // 桌面 Chrome
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  // Edge
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
  // Safari
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  // Firefox
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0',
  // 移动端
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
]

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)] }

/**
 * 生成一条登录日志
 * 策略：
 *   - 真实账号（admin/leader/staff/staff2）→ 大概率成功，小概率密码错
 *   - 虚拟账号（zhangsan 等）→ 100% 失败（账号不存在或密码错）
 * 时间分布：80% 集中在工作时间 9:00-19:00，20% 夜间
 */
function makeOne() {
  // 先决定成功/失败，再选匹配的账号
  const wantSuccess = Math.random() > 0.15 // 85% 成功

  let account
  if (wantSuccess) {
    // 成功 → 必须是真实账号
    account = rand(REAL_USERS)
  } else {
    // 失败 → 50% 真实账号密码错，50% 虚拟账号不存在
    account = Math.random() > 0.5 ? rand(REAL_USERS) : rand(FAKE_USERNAMES.map((n) => ({ id: null, username: n, name: null })))
  }

  const daysAgo = Math.floor(Math.random() * 30)
  const workHours = Math.random() > 0.2
  const hour = workHours
    ? 9 + Math.floor(Math.random() * 10)
    : [0, 1, 2, 3, 4, 5, 6, 20, 21, 22, 23][Math.floor(Math.random() * 11)]

  const ts = new Date()
  ts.setDate(ts.getDate() - daysAgo)
  ts.setHours(hour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0)

  return {
    userId: account.id,
    username: account.username,
    success: wantSuccess,
    ip: rand(IP_POOL),
    userAgent: rand(USER_AGENTS),
    createdAt: ts,
  }
}

// —— 主流程 ——

async function main() {
  const client = await pool.connect()
  try {
    // 1. 清空（非追加模式）
    if (!append) {
      const r = await client.query('TRUNCATE login_logs RESTART IDENTITY CASCADE')
      console.log('✅ TRUNCATE login_logs')
    }

    // 2. 预生成 + 排序（真实世界按时间顺序产生，倒序是查询时 ORDER BY DESC 的事）
    const rows = Array.from({ length: totalCount }, makeOne)
    rows.sort((a, b) => a.createdAt - b.createdAt) // 时间升序插入

    // 3. 批量 INSERT（每 200 条一批，避免参数过多）
    const BATCH_SIZE = 200
    let inserted = 0
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      const placeholders = batch
        .map((_, idx) => `($${idx * 5 + 1}, $${idx * 5 + 2}, $${idx * 5 + 3}, $${idx * 5 + 4}::inet, $${idx * 5 + 5})`)
        .join(', ')
      const params = batch.flatMap((r) => [r.userId, r.username, r.success, r.ip, r.userAgent])
      await client.query(
        `INSERT INTO login_logs (user_id, username, success, ip, user_agent) VALUES ${placeholders}`,
        params,
      )
      inserted += batch.length
      process.stdout.write(`\r🔄 inserted ${inserted}/${totalCount}`)
    }
    console.log(`\n✅ 插入完成：${inserted} 条`)

    // 4. 验证
    const { rows: stats } = await client.query(`
      SELECT success, count(*) as n, min(created_at) as earliest, max(created_at) as latest
        FROM login_logs GROUP BY success ORDER BY success`)
    const { rows: total } = await client.query('SELECT count(*) FROM login_logs')
    console.log(`\n📊 login_logs 总计：${total[0].count} 条`)
    for (const s of stats) {
      console.log(`   ${s.success ? '✅ 成功' : '❌ 失败'}: ${s.n} 条 | 时间 ${s.earliest} ~ ${s.latest}`)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('❌ seed 失败:', err.message)
  process.exit(1)
})
