// 前端常量（与后端 server/src/constants.js 保持镜像）
// - ROLE 中文：后端实际返回这 3 个中文角色名
// - STATUS 英文枚举：后端 tickets.status 为英文枚举（10 态），此处做中文 + el-tag 颜色映射
// - *_TAG_TYPE：纯 UI 颜色映射，与后端数据无关
// - ANNOUNCEMENTS：演示用公告死数据（无对应后端模块）

export const DEPT_OPTIONS = ['技术部', '市场部', '财务部', '人事部', '行政部']

// 后端返回的中文角色名
export const ROLE_OPTIONS = ['超级管理员', '技术部部长', '技术部普通员工']
export const ROLE = {
  ADMIN: '超级管理员',
  LEADER: '技术部部长',
  STAFF: '技术部普通员工',
}

// 角色 → el-tag 类型
export const ROLE_TAG_TYPE = {
  超级管理员: 'danger',
  技术部部长: 'warning',
  技术部普通员工: 'info',
}

// 用户状态 → el-tag 类型
export const USER_STATUS_TAG_TYPE = {
  启用: 'success',
  禁用: 'info',
  锁定: 'danger',
}

// ---------- 工单状态（10 态英文枚举 → 中文 + el-tag 颜色） ----------
export const STATUS_TEXT = {
  draft: '草稿',
  pending_approval: '待审批',
  pending_assignment: '待分配',
  pending_acceptance: '待接单',
  pending_processing: '待处理',
  processing: '处理中',
  pending_confirmation: '待确认',
  suspended: '已挂起',
  cancelled: '已取消',
  closed: '已关闭',
}

export const STATUS_TAG_TYPE = {
  draft: 'info',
  pending_approval: 'warning',
  pending_assignment: 'warning',
  pending_acceptance: 'warning',
  pending_processing: 'warning',
  processing: 'primary',
  pending_confirmation: 'warning',
  suspended: 'info',
  cancelled: 'info',
  closed: 'success',
}

// 工单优先级 → el-tag 类型（字典 code，后端返回）
export const PRIORITY_TAG_TYPE = {
  high: 'danger',
  medium: 'warning',
  low: 'info',
  高: 'danger',   // 兼容旧 mock 中文值
  中: 'warning',
  低: 'info',
}

// SLA 状态 → el-tag 类型
export const SLA_STATUS_TAG_TYPE = {
  pending: 'info',
  running: 'primary',
  paused: 'warning',
  breached: 'danger',
  met: 'success',
  breached_closed: 'danger',
  cancelled: 'info',
}

export const SLA_STATUS_TEXT = {
  pending: '待启动',
  running: '计时中',
  paused: '已暂停',
  breached: '已超时',
  met: '已达标',
  breached_closed: '超时完结',
  cancelled: '已取消',
}

// 演示公告（暂无后端公告模块）
export const ANNOUNCEMENTS = [
  { id: 1, title: '数据库升级通知：10月3日 22:00-24:00 暂停服务', date: '2026-09-30' },
  { id: 2, title: 'OA 服务例行维护通知，请提前保存工作内容', date: '2026-09-29' },
  { id: 3, title: '关于国庆假期工单值班安排的通知', date: '2026-09-28' },
  { id: 4, title: '工单管理系统 V2.0 正式上线公告', date: '2026-09-25' },
]
