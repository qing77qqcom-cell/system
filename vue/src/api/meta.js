import service from '@/utils/request'

// 下拉选项枚举（部门 / 问题类型 / 优先级 / 状态 / 权限类型 / 设备类型）
export function getMeta() {
  return service.get('/meta')
}
