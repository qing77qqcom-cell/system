// 前端常量（原 mock 目录清理后唯一保留的静态数据）
// - DEPT/ROLE 选项：与后端 server/src/constants.js 保持镜像，新增枚举需两端同步
// - *_TAG_TYPE：纯 UI 颜色映射，与后端数据无关
// - ANNOUNCEMENTS：演示用公告死数据（无对应后端模块，保留展示）

export const DEPT_OPTIONS = ['技术部', '市场部', '财务部', '人事部', '行政部']

export const ROLE_OPTIONS = ['超级管理员', '部长', '普通员工']

// 角色 → el-tag 类型
export const ROLE_TAG_TYPE = {
  超级管理员: 'danger',
  部长: 'warning',
  普通员工: 'info',
}

// 用户状态 → el-tag 类型
export const USER_STATUS_TAG_TYPE = {
  启用: 'success',
  禁用: 'info',
}

// 工单状态 → el-tag 类型
export const STATUS_TAG_TYPE = {
  待处理: 'warning',
  处理中: 'primary',
  已完成: 'success',
  已关闭: 'info',
  已退回: 'danger',
}

// 工单优先级 → el-tag 类型
export const PRIORITY_TAG_TYPE = {
  高: 'danger',
  中: 'warning',
  低: 'info',
}

// 演示公告（暂无后端公告模块）
export const ANNOUNCEMENTS = [
  { id: 1, title: '数据库升级通知：10月3日 22:00-24:00 暂停服务', date: '2026-09-30' },
  { id: 2, title: 'OA 服务例行维护通知，请提前保存工作内容', date: '2026-09-29' },
  { id: 3, title: '关于国庆假期工单值班安排的通知', date: '2026-09-28' },
  { id: 4, title: '工单管理系统 V2.0 正式上线公告', date: '2026-09-25' },
]
