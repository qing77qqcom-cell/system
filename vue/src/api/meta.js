import service from '@/utils/request'

// 下拉选项枚举（字典表，按 dict_type 分组返回）
// 后端路由：GET /api/dictionaries?dict_type=xxx
// 一次拉全量字典，前端按 dictType 分组返回
export async function getMeta() {
  const list = await service.get('/dictionaries')
  const groups = {}
  for (const item of list) {
    const t = item.dictType
    if (!groups[t]) groups[t] = []
    // 同时保留 { code, label } — code 给表单提交/接口查询用，label 给 UI 显示用
    groups[t].push({ code: item.code ?? item.label, label: item.label ?? item.code })
  }
  return {
    depts:     groups.dept?.map(i => i.label) || [],
    types:     groups.ticket_type || [],          // [{ code, label }] — 工单类型需要 code 传给后端
    statuses:  groups.ticket_status || [],        // [{ code, label }] — 状态筛选需要 code
    priorities: groups.priority?.map(i => i.label) || [],  // 纯字符串数组 ['低','中','高','紧急']
  }
}
