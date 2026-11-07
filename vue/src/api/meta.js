import service from '@/utils/request'

/**
 * 下拉选项元数据（一次性拉全，前端按用途分组返回）
 * - 字典类（工单类型/状态/优先级）：从 GET /api/dictionaries 全量拉取后按 dictType 分组
 * - 部门：从 GET /api/departments 拉取扁平列表，取 name 字段
 */
export async function getMeta() {
  const [dictList, deptList] = await Promise.all([
    service.get('/dictionaries'),
    service.get('/departments'),
  ])

  // 按 dictType 分组
  const groups = {}
  for (const item of dictList) {
    const t = item.dictType
    if (!groups[t]) groups[t] = []
    groups[t].push({ code: item.code ?? item.label, label: item.label ?? item.code })
  }

  // 部门：后端返回 { id, name, ... }[]，提取 name 字符串
  const depts = Array.isArray(deptList)
    ? deptList.map(d => d.name).filter(Boolean)
    : []

  return {
    depts,
    types:     groups.ticket_type || [],          // [{ code, label }] — 工单类型需要 code 传给后端
    statuses:  groups.ticket_status || [],        // [{ code, label }] — 状态筛选需要 code
    priorities: (groups.priority || groups.ticket_priority || []).map(i => i.label || i.code),
    permTypes: groups.perm_type || groups.account_perm_type || [],
    deviceTypes: groups.device_type || [],
  }
}
