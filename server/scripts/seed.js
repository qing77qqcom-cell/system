// 演示账号初始化脚本（幂等：已存在的 username 跳过，不会覆盖密码）
// 与前端 SEED_USERS 一一对应；统一初始密码 123456（bcrypt 哈希后入库）
import bcrypt from 'bcryptjs'
import { pool } from '../src/db.js'

// 与前端 src/mock/users.js 的 SEED_USERS 保持一致
const USERS = [
  { username: 'admin', name: '系统管理员', role: '超级管理员', dept: null, email: 'admin@oa.com', status: '启用', createdAt: '2026-01-01 09:00' }, // 系统管理员不属于任何部门
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

  // ============ 演示工单：体现角色可见性（提交人是自己 OR 处理人是自己） ============
  // id 固定 14 位（WO + yyyymmdd + 4 位序号），ON CONFLICT 幂等，重复执行不产生脏数据
  // username → id 查询缓存，避免硬编码自增 id
  const userIdOf = {}
  {
    const { rows } = await pool.query('SELECT id, username FROM users')
    for (const r of rows) userIdOf[r.username] = r.id
  }

  const DEMO_ORDERS = [
    {
      id: 'WO202610100001', title: 'VPN 无法连接，居家办公受阻', type: '网络异常', dept: '技术部',
      priority: '高', status: '待处理', submitter: 'zhangsan', handler: null,
      createdAt: '2026-10-10 09:20', deadline: '2026-10-25 18:00', completedAt: null,
      description: '在家连接公司 VPN 一直超时，重装客户端无效，影响远程开发。',
      extra: {},
      logs: [{ user: 'zhangsan', action: '提交工单', remark: '', at: '2026-10-10 09:20' }],
    },
    {
      id: 'WO202610110002', title: '申请开通 Git 仓库读写权限', type: '账号权限', dept: '技术部',
      priority: '中', status: '已完成', submitter: 'zhangsan', handler: 'lisi',
      createdAt: '2026-10-11 10:00', deadline: '2026-10-15 18:00', completedAt: '2026-10-13 16:30',
      description: '新项目需要 company-core 仓库的读写权限。',
      extra: { account: 'zhangsan', permType: '系统权限', applyReason: '参与新项目开发' },
      logs: [
        { user: 'zhangsan', action: '提交工单', remark: '', at: '2026-10-11 10:00' },
        { user: 'admin', action: '分配工单', remark: '分配给 李四', at: '2026-10-11 11:00' },
        { user: 'lisi', action: '完成工单', remark: '权限已开通，请验证', at: '2026-10-13 16:30' },
      ],
    },
    {
      // 关键演示：跨部门工单，zhangsan 不是提交人、是处理人 → 依然可见
      id: 'WO202610120003', title: '会议室投影仪 HDMI 无信号', type: '设备故障', dept: '市场部',
      priority: '中', status: '处理中', submitter: 'wangwu', handler: 'zhangsan',
      createdAt: '2026-10-12 14:00', deadline: '2026-10-19 18:00', completedAt: null,
      description: '三楼会议室投影仪 HDMI 接口无输出，换线无效，需要检修。',
      extra: { deviceNo: 'TX-HY-03', deviceType: '投影仪', faultDesc: 'HDMI 接口无信号输出' },
      logs: [
        { user: 'wangwu', action: '提交工单', remark: '', at: '2026-10-12 14:00' },
        { user: 'admin', action: '分配工单', remark: '分配给 张三（技术部）', at: '2026-10-12 15:00' },
        { user: 'zhangsan', action: '已接单', remark: '', at: '2026-10-12 16:20' },
      ],
    },
    {
      // 负例：zhangsan 既非提交人也非处理人 → 不可见；qianqi 作为处理人可见
      id: 'WO202610130004', title: '办公电脑频繁蓝屏', type: '设备故障', dept: '行政部',
      priority: '高', status: '待处理', submitter: 'zhaoliu', handler: 'qianqi',
      createdAt: '2026-10-13 09:40', deadline: '2026-10-23 18:00', completedAt: null,
      description: '工位电脑一天蓝屏两三次，错误代码 MEMORY_MANAGEMENT。',
      extra: { deviceNo: 'PC-XZ-011', deviceType: '台式机', faultDesc: '随机蓝屏，疑似内存故障' },
      logs: [
        { user: 'zhaoliu', action: '提交工单', remark: '', at: '2026-10-13 09:40' },
        { user: 'admin', action: '分配工单', remark: '分配给 钱七', at: '2026-10-13 10:30' },
      ],
    },
    {
      id: 'WO202610140005', title: '打印机驱动安装失败', type: '系统BUG', dept: '市场部',
      priority: '低', status: '已退回', submitter: 'wangwu', handler: 'zhangsan',
      createdAt: '2026-10-14 11:00', deadline: '2026-10-24 18:00', completedAt: null,
      description: '新装驱动一直报错 0x00000709，无法添加网络打印机。',
      extra: {},
      logs: [
        { user: 'wangwu', action: '提交工单', remark: '', at: '2026-10-14 11:00' },
        { user: 'admin', action: '分配工单', remark: '分配给 张三（技术部）', at: '2026-10-14 13:00' },
        { user: 'zhangsan', action: '退回工单', remark: '请补充打印机型号与操作系统版本', at: '2026-10-14 15:40' },
      ],
    },
    {
      // 负例：技术部工单但与 zhangsan 无关 → 普通员工不可见，部长按本部门可见
      id: 'WO202610150006', title: '考勤机数据同步异常', type: '其他需求', dept: '技术部',
      priority: '中', status: '待处理', submitter: 'lisi', handler: null,
      createdAt: '2026-10-15 10:30', deadline: '2026-10-26 18:00', completedAt: null,
      description: '考勤机数据已两天未同步到后台，需要排查接口。',
      extra: {},
      logs: [{ user: 'lisi', action: '提交工单', remark: '', at: '2026-10-15 10:30' }],
    },
  ]

  let orderInserted = 0
  let logInserted = 0
  for (const o of DEMO_ORDERS) {
    const { rowCount } = await pool.query(
      `INSERT INTO orders (id, title, type, dept, priority, status, submitter_id, handler_id,
                           deadline, completed_at, description, extra, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               ($9 || '+08')::timestamptz, ($10 || '+08')::timestamptz, $11, $12::jsonb, ($13 || '+08')::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [o.id, o.title, o.type, o.dept, o.priority, o.status, userIdOf[o.submitter],
       o.handler ? userIdOf[o.handler] : null,
       o.deadline, o.completedAt, o.description, JSON.stringify(o.extra), o.createdAt],
    )
    if (rowCount === 0) continue // 已存在，跳过（避免重复插日志）
    orderInserted += 1
    for (const l of o.logs) {
      await pool.query(
        `INSERT INTO order_logs (order_id, user_id, action, remark, created_at)
         VALUES ($1, $2, $3, $4, ($5 || '+08')::timestamptz)`,
        [o.id, userIdOf[l.user], l.action, l.remark, l.at],
      )
      logInserted += 1
    }
  }
  console.log(`种子工单完成：新增 ${orderInserted} 条（日志 ${logInserted} 条），已存在则跳过`)
  console.log('可见性预期：admin 6 条全部 / manager 3 条（技术部）/ zhangsan 4 条（提交2+处理2）')
} catch (err) {
  console.error('种子写入失败：', err.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
