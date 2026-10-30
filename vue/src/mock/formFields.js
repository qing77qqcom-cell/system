/**
 * Mock 数据：模拟后端 GET /api/form-configs?ticket_type=xxx 的返回值
 *
 * 用途：
 *   1. 前端开发调试时直接用，不用等后端启动
 *   2. DynamicField.vue 单字段组件测试时的 mock 输入
 *   3. DynamicForm.vue 的单元测试数据源
 *
 * 与后端 init.sql 第 461-469 行种子数据 1:1 对齐
 *   + 额外加了 active=false 的下线用例
 *   + 额外加了 v2.0 扩展字段测试用例（带 placeholder/defaultValue/minLength/maxLength/visibleWhen）
 */

// ============================================================
// v1.0 真实种子数据 — 与后端 init.sql 完全一致
// ============================================================

export const faultRepair = [
  {
    id: 5,
    ticketType: 'fault_repair',
    fieldKey: 'deviceNo',
    label: '设备编号',
    fieldType: 'text',
    required: true,
    options: null,
    sort: 1,
    active: true,
  },
  {
    id: 6,
    ticketType: 'fault_repair',
    fieldKey: 'deviceType',
    label: '设备类型',
    fieldType: 'select',
    required: true,
    options: ['电脑', '打印机', '服务器', '路由器'],  // ← 纯字符串数组格式
    sort: 2,
    active: true,
  },
  {
    id: 7,
    ticketType: 'fault_repair',
    fieldKey: 'faultDesc',
    label: '故障描述',
    fieldType: 'textarea',
    required: false,
    options: null,
    sort: 3,
    active: true,
  },
]

export const accountPermission = [
  {
    id: 1,
    ticketType: 'account_permission',
    fieldKey: 'system',
    label: '目标系统',
    fieldType: 'select',
    required: true,
    options: ['OA', '邮箱', 'VPN', 'ERP'],  // ← 纯字符串数组
    sort: 1,
    active: true,
  },
  {
    id: 2,
    ticketType: 'account_permission',
    fieldKey: 'permType',
    label: '权限类型',
    fieldType: 'select',
    required: true,
    options: ['新增', '变更', '注销'],
    sort: 2,
    active: true,
  },
]

export const reimbursement = [
  {
    id: 3,
    ticketType: 'reimbursement',
    fieldKey: 'amount',
    label: '报销金额（元）',
    fieldType: 'number',
    required: true,
    options: null,
    sort: 1,
    active: true,
  },
  {
    id: 4,
    ticketType: 'reimbursement',
    fieldKey: 'subject',
    label: '报销科目',
    fieldType: 'select',
    required: true,
    options: ['办公用品', '差旅费', '招待费', '其他'],
    sort: 2,
    active: true,
  },
]

// ============================================================
// v1.0 边界测试数据 — 覆盖特殊场景
// ============================================================

/**
 * options 为对象数组格式（兼容老格式）
 * 后端当前只存纯字符串数组，但前端 normalizedOptions 要兼容这种
 */
export const objectOptions = [
  {
    id: 99,
    ticketType: 'test',
    fieldKey: 'department',
    label: '部门',
    fieldType: 'select',
    required: true,
    options: [
      { label: '技术研发部', value: 'tech' },
      { label: '市场运营部', value: 'market' },
      { label: '财务部', value: 'finance' },
    ],
    sort: 1,
    active: true,
  },
]

/**
 * active=false：被 admin 下线的字段，前端应过滤掉不渲染
 */
export const inactiveField = [
  {
    id: 100,
    ticketType: 'test',
    fieldKey: 'oldField',
    label: '已废弃字段',
    fieldType: 'text',
    required: false,
    options: null,
    sort: 1,
    active: false,  // ← 关键：DynamicForm 应该跳过这个
  },
]

/**
 * 覆盖全部 5 种 fieldType — 确保 DynamicField 的 v-if/v-else-if 全跑通
 */
export const allFieldTypes = [
  {
    id: 101, ticketType: 'test', fieldKey: 'shortText',
    label: '短文本', fieldType: 'text',
    required: true, options: null, sort: 1, active: true,
  },
  {
    id: 102, ticketType: 'test', fieldKey: 'longText',
    label: '长文本', fieldType: 'textarea',
    required: false, options: null, sort: 2, active: true,
  },
  {
    id: 103, ticketType: 'test', fieldKey: 'count',
    label: '数量', fieldType: 'number',
    required: true, options: null, sort: 3, active: true,
  },
  {
    id: 104, ticketType: 'test', fieldKey: 'category',
    label: '分类', fieldType: 'select',
    required: true, options: ['A类', 'B类', 'C类'], sort: 4, active: true,
  },
  {
    id: 105, ticketType: 'test', fieldKey: 'deadline',
    label: '截止日期', fieldType: 'date',
    required: false, options: null, sort: 5, active: true,
  },
]

/**
 * 所有字段 required=false — 必填标记和校验规则都不应该出现
 */
export const allOptional = [
  {
    id: 106, ticketType: 'test', fieldKey: 'remark',
    label: '备注', fieldType: 'text',
    required: false, options: null, sort: 1, active: true,
  },
  {
    id: 107, ticketType: 'test', fieldKey: 'attachDate',
    label: '关联日期', fieldType: 'date',
    required: false, options: null, sort: 2, active: true,
  },
]

// ============================================================
// v2.0 扩展测试数据 — 测试 placeholder / defaultValue / visibleWhen 等
// 当前后端还没这些列，先 mock 出来验证前端条件求值器
// ============================================================

/**
 * visibleWhen 联动：只有 deviceType=服务器 时才显示 serverAddress
 */
export const visibleWhenDemo = [
  {
    id: 201, ticketType: 'fault_repair', fieldKey: 'deviceType',
    label: '设备类型', fieldType: 'select',
    required: true, options: ['电脑', '打印机', '服务器', '路由器'],
    sort: 1, active: true,
  },
  {
    id: 202, ticketType: 'fault_repair', fieldKey: 'serverAddress',
    label: '服务器地址', fieldType: 'text',
    required: false, options: null, sort: 2, active: true,
    // v2.0 扩展（当前后端无此列，mock 验证前端）
    placeholder: '例如：192.168.1.100',
    visibleWhen: { fieldKey: 'deviceType', eq: '服务器' },
  },
  {
    id: 203, ticketType: 'fault_repair', fieldKey: 'rackNumber',
    label: '机柜编号', fieldType: 'text',
    required: false, options: null, sort: 3, active: true,
    visibleWhen: { fieldKey: 'deviceType', in: ['服务器', '路由器'] },
  },
]

/**
 * v2.0 完整扩展字段：带 placeholder/defaultValue/minLength/maxLength
 */
export const v2ExtendedFields = [
  {
    id: 301, ticketType: 'test', fieldKey: 'userCode',
    label: '用户名', fieldType: 'text',
    required: true, options: null, sort: 1, active: true,
    placeholder: '请输入 OA 工号',      // v2.0 扩展
    defaultValue: '',                  // v2.0 扩展
    minLength: 3,                      // v2.0 扩展 → 自动加 min 校验
    maxLength: 20,                     // v2.0 扩展 → 自动加 max 校验 + show-word-limit
  },
  {
    id: 302, ticketType: 'test', fieldKey: 'budget',
    label: '预算金额', fieldType: 'number',
    required: true, options: null, sort: 2, active: true,
    placeholder: '请输入预算',
    defaultValue: 0,
  },
]

// ============================================================
// 聚合：一个函数模拟真实后端 GET /api/form-configs
// ============================================================

const allByType = {
  fault_repair,
  account_permission,
  reimbursement,
}

/**
 * 模拟 listFormConfigs(ticketType) 的返回
 * @param {string} ticketType - 工单类型
 * @returns {Promise<FieldConfig[]>} - 模拟异步
 */
export function mockListFormConfigs(ticketType) {
  return new Promise((resolve, reject) => {
    // 模拟网络延迟 100-300ms
    const delay = 100 + Math.random() * 200
    setTimeout(() => {
      const list = allByType[ticketType]
      if (!list) {
        reject(new Error(`未知的工单类型: ${ticketType}`))
        return
      }
      // 后端 responseEnvelope: { code: 0, message: 'ok', data: [...] }
      resolve({ code: 0, message: 'ok', data: list })
    }, delay)
  })
}

export default {
  faultRepair,
  accountPermission,
  reimbursement,
  objectOptions,
  inactiveField,
  allFieldTypes,
  allOptional,
  visibleWhenDemo,
  v2ExtendedFields,
  mockListFormConfigs,
}
