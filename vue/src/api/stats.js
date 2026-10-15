import service from '@/utils/request'

// 首页指标（支持 submitterId / handlerId 用于用户详情页）
export function getStatsOverview(params = {}) {
  return service.get('/stats/overview', { params })
}
