// 演示工单初始化脚本（幂等：已存在的工单号跳过，不重复写日志）
// 与前端 src/mock/data.js 的 SEED_ORDERS 一一对应；提交人/处理人按姓名映射 users.id
import { pool, withTx } from '../src/db.js'

// 与前端 SEED_ORDERS 完全一致（id 沿用前端种子编号，13 位）
const SEED_ORDERS = [
  {
    id: 'WO20260928001', title: 'OA 登录提示账号被锁定', type: '系统BUG', dept: '技术部', priority: '高',
    submitter: '张三', handler: '李四', status: '处理中',
    createdAt: '2026-09-28 10:12', deadline: '2026-09-29 18:00', completedAt: null,
    description: '今天早上登录 OA 时反复提示“账号已被锁定”，但昨天还能正常使用。已尝试重启浏览器和清除缓存，问题依旧，请协助排查。',
    attachments: [{ name: '错误提示截图.jpg' }], extra: {},
    logs: [
      { user: '张三', time: '2026-09-28 10:12', action: '提交工单' },
      { user: '李四', time: '2026-09-28 10:45', action: '已接单' },
      { user: '李四', time: '2026-09-28 11:20', action: '处理中', remark: '正在后台核查账号锁定日志' },
    ],
  },
  {
    id: 'WO20260928002', title: '申请开通 VPN 远程办公权限', type: '账号权限', dept: '市场部', priority: '中',
    submitter: '王五', handler: '', status: '待处理',
    createdAt: '2026-09-28 14:03', deadline: '2026-10-02 18:00', completedAt: null,
    description: '国庆出差期间需要通过 VPN 访问公司内部客户资料系统，申请开通 VPN 权限。',
    attachments: [], extra: { account: 'wangwu', permType: 'VPN权限', applyReason: '假期出差，需要远程访问客户管理系统' },
    logs: [{ user: '王五', time: '2026-09-28 14:03', action: '提交工单' }],
  },
  {
    id: 'WO20260927003', title: '部门打印机卡纸无法使用', type: '设备故障', dept: '行政部', priority: '高',
    submitter: '赵六', handler: '', status: '待处理',
    createdAt: '2026-09-27 09:20', deadline: '2026-09-28 12:00', completedAt: null,
    description: '行政部 3 楼打印机频繁卡纸，已自行取出纸张仍无法正常打印，影响合同打印。',
    attachments: [{ name: '打印机故障.jpg' }], extra: { deviceNo: 'PRT-3F-007', deviceType: '打印机', faultDesc: '频繁卡纸，取出后提示盖板未合紧' },
    logs: [{ user: '赵六', time: '2026-09-27 09:20', action: '提交工单' }],
  },
  {
    id: 'WO20260930001', title: '财务系统报表导出报错', type: '系统BUG', dept: '财务部', priority: '高',
    submitter: '钱七', handler: '李四', status: '处理中',
    createdAt: '2026-09-30 16:40', deadline: '2026-10-01 12:00', completedAt: null,
    description: '在财务系统导出 9 月应收报表时弹出“500 服务器异常”，急需月结数据，请加急处理。',
    attachments: [{ name: '报错页面.png' }, { name: '操作录屏.mp4' }], extra: {},
    logs: [
      { user: '钱七', time: '2026-09-30 16:40', action: '提交工单' },
      { user: '李四', time: '2026-09-30 17:05', action: '已接单' },
      { user: '钱七', time: '2026-09-30 17:30', action: '催办', remark: '月结时间紧，请尽快处理' },
    ],
  },
  {
    id: 'WO20260925006', title: '会议室无线网络不稳定', type: '网络异常', dept: '人事部', priority: '低',
    submitter: '孙八', handler: '周九', status: '已完成',
    createdAt: '2026-09-25 11:00', deadline: '2026-09-26 18:00', completedAt: '2026-09-26 15:22',
    description: '二号会议室视频会议时网络频繁掉线，影响面试与线上会议。',
    attachments: [], extra: {},
    logs: [
      { user: '孙八', time: '2026-09-25 11:00', action: '提交工单' },
      { user: '周九', time: '2026-09-25 13:10', action: '已接单' },
      { user: '周九', time: '2026-09-26 15:22', action: '完成工单', remark: '已更换无线 AP，现场测速正常' },
    ],
  },
  {
    id: 'WO20260926008', title: '申请安装设计类软件', type: '其他需求', dept: '市场部', priority: '低',
    submitter: '吴十', handler: '周九', status: '已完成',
    createdAt: '2026-09-26 10:00', deadline: '2026-09-30 18:00', completedAt: '2026-10-01 09:30',
    description: '新入职设计师需要安装 Figma、Photoshop 等设计软件并完成授权。',
    attachments: [{ name: '软件清单.pdf' }], extra: {},
    logs: [
      { user: '吴十', time: '2026-09-26 10:00', action: '提交工单' },
      { user: '周九', time: '2026-09-26 14:00', action: '已接单' },
      { user: '周九', time: '2026-10-01 09:30', action: '完成工单', remark: '软件已安装并激活授权' },
    ],
  },
  {
    id: 'WO20260929005', title: '新员工工牌与门禁权限开通', type: '账号权限', dept: '行政部', priority: '中',
    submitter: '郑十一', handler: '', status: '待处理',
    createdAt: '2026-09-29 09:30', deadline: '2026-10-05 18:00', completedAt: null,
    description: '3 名新员工下周一入职，需要办理工牌并开通办公区门禁权限。',
    attachments: [], extra: { account: 'zhengshiyi', permType: '其他权限', applyReason: '新员工入职，需开通办公区门禁' },
    logs: [{ user: '郑十一', time: '2026-09-29 09:30', action: '提交工单' }],
  },
  {
    id: 'WO20260930002', title: '办公电脑无法开机', type: '设备故障', dept: '技术部', priority: '高',
    submitter: '冯十二', handler: '李四', status: '处理中',
    createdAt: '2026-09-30 08:50', deadline: '2026-10-01 18:00', completedAt: null,
    description: '电脑按电源键无任何反应，电源指示灯不亮，已检查插座供电正常。',
    attachments: [], extra: { deviceNo: 'PC-JS-022', deviceType: '办公电脑', faultDesc: '按电源键无反应，指示灯不亮' },
    logs: [
      { user: '冯十二', time: '2026-09-30 08:50', action: '提交工单' },
      { user: '李四', time: '2026-09-30 09:15', action: '已接单' },
    ],
  },
  {
    id: 'WO20260920003', title: 'OA 登录密码重置', type: '账号权限', dept: '技术部', priority: '低',
    submitter: '张三', handler: '李四', status: '已关闭',
    createdAt: '2026-09-20 10:00', deadline: '2026-09-21 18:00', completedAt: null,
    description: '忘记 OA 登录密码，申请重置。',
    attachments: [], extra: { account: 'zhangsan', permType: 'OA登录权限', applyReason: '忘记密码无法登录' },
    logs: [
      { user: '张三', time: '2026-09-20 10:00', action: '提交工单' },
      { user: '张三', time: '2026-09-20 11:00', action: '关闭工单', remark: '已自行找回密码' },
    ],
  },
  {
    id: 'WO20260927004', title: '企业邮箱客户端配置咨询', type: '账号权限', dept: '财务部', priority: '中',
    submitter: '钱七', handler: '周九', status: '已退回',
    createdAt: '2026-09-27 15:00', deadline: '2026-09-29 18:00', completedAt: null,
    description: 'Foxmail 无法收发企业邮箱邮件，请求协助配置。',
    attachments: [], extra: { account: 'qianqi', permType: '企业邮箱', applyReason: '客户端无法收发邮件' },
    logs: [
      { user: '钱七', time: '2026-09-27 15:00', action: '提交工单' },
      { user: '周九', time: '2026-09-27 16:30', action: '退回工单', remark: '请补充邮箱域名与报错截图后重新提交' },
    ],
  },
]

try {
  // 姓名 → id 映射（来自 users 表，避免写死主键）
  const { rows: users } = await pool.query('SELECT id, name FROM users')
  const idByName = Object.fromEntries(users.map((u) => [u.name, u.id]))

  let inserted = 0
  let skipped = 0
  for (const o of SEED_ORDERS) {
    const submitterId = idByName[o.submitter]
    const handlerId = o.handler ? idByName[o.handler] : null
    if (!submitterId) {
      console.warn(`跳过 ${o.id}：提交人「${o.submitter}」不存在`)
      skipped++
      continue
    }
    await withTx(async (client) => {
      const { rowCount } = await client.query(
        `INSERT INTO orders (id, title, type, dept, priority, status, submitter_id, handler_id,
                             deadline, completed_at, description, extra, attachments, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14)
         ON CONFLICT (id) DO NOTHING`,
        [
          o.id, o.title, o.type, o.dept, o.priority, o.status, submitterId, handlerId,
          o.deadline, o.completedAt, o.description, JSON.stringify(o.extra), JSON.stringify(o.attachments), o.createdAt,
        ],
      )
      if (rowCount === 0) return // 已存在，整体跳过（避免日志重复）
      for (const log of o.logs) {
        await client.query(
          `INSERT INTO order_logs (order_id, user_id, action, remark, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [o.id, idByName[log.user], log.action, log.remark || '', log.time],
        )
      }
      inserted++
    })
  }
  skipped = SEED_ORDERS.length - inserted
  console.log(`种子工单完成：新增 ${inserted} 条，跳过 ${skipped} 条（已存在）`)
} catch (err) {
  console.error('种子工单写入失败：', err.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
