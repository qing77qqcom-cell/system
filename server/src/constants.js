// 与前端 src/mock/data.js 的选项常量保持一致（数据库 CHECK 约束同源）
export const DEPT_OPTIONS = ['技术部', '市场部', '财务部', '人事部', '行政部']
export const TYPE_OPTIONS = ['账号权限', '设备故障', '网络异常', '系统BUG', '其他需求']
export const PRIORITY_OPTIONS = ['高', '中', '低']
export const STATUS_OPTIONS = ['待处理', '处理中', '已完成', '已关闭', '已退回']

// 动态扩展字段选项（问题类型 = 账号权限 / 设备故障）
export const PERM_OPTIONS = ['OA登录权限', 'VPN权限', '企业邮箱', '财务系统', '其他权限']
export const DEVICE_OPTIONS = ['办公电脑', '打印机', '网络设备', '投影仪', '其他设备']
