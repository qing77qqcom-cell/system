// OpenAPI 3.0 接口规范：与 routes 实现保持同步，Swagger UI 渲染于 /api-docs
const envelope = (dataSchema) => ({
  type: 'object',
  properties: {
    code: { type: 'integer', description: '0=成功，非 0 为错误码（与 HTTP 状态码一致）' },
    message: { type: 'string' },
    data: dataSchema,
  },
  required: ['code', 'message'],
})

const jsonBody = (schema, required = true) => ({
  required,
  content: { 'application/json': { schema } },
})

const okResp = (dataSchema, description = '成功') => ({
  200: { description, content: { 'application/json': { schema: envelope(dataSchema) } } },
})

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'OA 工单管理系统 API',
    version: '1.0.0',
    description:
      'Vue3 + Element Plus 工单系统的独立后端（Express 5 + PostgreSQL/Neon）。\n\n' +
      '**认证方式**：登录后携带 `Authorization: Bearer <token>`；用户被禁用后已签发的 token 立即失效。\n\n' +
      '**角色**：超级管理员（全局）/ 部长（本部门授权范围）/ 普通员工（本人提交的 + 被分配处理的）。\n\n' +
      '**时间格式**：所有日期时间均为东八区 `YYYY-MM-DD HH:mm` 字符串。',
  },
  servers: [
    { url: 'http://localhost:3000', description: '本地开发' },
    { url: 'https://YOUR-SERVICE.onrender.com', description: 'Render 部署（替换为实际域名）' },
  ],
  tags: [
    { name: '健康检查' }, { name: '认证' }, { name: '工单' },
    { name: '统计' }, { name: '用户管理' }, { name: '附件' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          username: { type: 'string' },
          name: { type: 'string' },
          role: { type: 'string', enum: ['超级管理员', '部长', '普通员工'] },
          dept: { type: 'string', enum: ['技术部', '市场部', '财务部', '人事部', '行政部'] },
          email: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['启用', '禁用'] },
          createdAt: { type: 'string', example: '2026-01-01 09:00' },
        },
      },
      LoginResp: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'JWT；remember=true 有效期 7 天，否则 1 天' },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'WO20260928K3XQ', description: 'WO + 8 位日期 + 4 位随机字符' },
          title: { type: 'string' },
          type: { type: 'string', enum: ['账号权限', '设备故障', '网络异常', '系统BUG', '其他需求'] },
          dept: { type: 'string', enum: ['技术部', '市场部', '财务部', '人事部', '行政部'] },
          priority: { type: 'string', enum: ['高', '中', '低'] },
          status: { type: 'string', enum: ['待处理', '处理中', '已完成', '已关闭', '已退回'] },
          submitter: { type: 'string', description: '提交人姓名' },
          handler: { type: 'string', nullable: true, description: '处理人姓名，未接单为 null' },
          createdAt: { type: 'string' },
          deadline: { type: 'string', nullable: true },
          completedAt: { type: 'string', nullable: true },
          description: { type: 'string' },
          attachments: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, url: { type: 'string' } },
            },
          },
          extra: { type: 'object', description: '类型扩展字段（账号权限：account/permType/applyReason；设备故障：deviceNo/deviceType/faultDesc）' },
        },
      },
      OrderLog: {
        type: 'object',
        properties: {
          user: { type: 'string' },
          time: { type: 'string' },
          action: { type: 'string', example: '提交工单' },
          remark: { type: 'string' },
        },
      },
      OrderDetail: {
        allOf: [
          { $ref: '#/components/schemas/Order' },
          { type: 'object', properties: { logs: { type: 'array', items: { $ref: '#/components/schemas/OrderLog' } } } },
        ],
      },
      StatsOverview: {
        type: 'object',
        properties: {
          total: { type: 'integer' }, pending: { type: 'integer' }, processing: { type: 'integer' },
          completed: { type: 'integer' }, closed: { type: 'integer' }, returned: { type: 'integer' },
          overdue: { type: 'integer', description: '未完成且已过截止时间' },
          monthDone: { type: 'integer', description: '本月完成数' },
          avgProcessHours: { type: 'number', description: '平均处理时长（小时，1 位小数）' },
        },
      },
      TrendPoint: {
        type: 'object',
        properties: {
          date: { type: 'string', example: '2026-10-14' },
          created: { type: 'integer' }, completed: { type: 'integer' },
        },
      },
      WorkloadRow: {
        type: 'object',
        properties: {
          handlerId: { type: 'integer' }, handlerName: { type: 'string' },
          processing: { type: 'integer' }, completed: { type: 'integer' },
          avgProcessHours: { type: 'number' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    // ===== 健康检查 =====
    '/api/health': {
      get: {
        tags: ['健康检查'], security: [], summary: '服务与数据库健康检查',
        responses: {
          200: { description: '正常', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' }, db: { type: 'string' } } } } } },
          503: { description: '数据库不可用' },
        },
      },
    },
    // ===== 元数据（下拉选项枚举） =====
    '/api/meta': {
      get: {
        tags: ['元数据'], security: [], summary: '获取前端下拉选项枚举（部门/类型/优先级/状态/权限类型/设备类型）',
        responses: {
          ...okResp({
            type: 'object',
            properties: {
              depts: { type: 'array', items: { type: 'string' } },
              types: { type: 'array', items: { type: 'string' } },
              priorities: { type: 'array', items: { type: 'string' } },
              statuses: { type: 'array', items: { type: 'string' } },
              permTypes: { type: 'array', items: { type: 'string' } },
              deviceTypes: { type: 'array', items: { type: 'string' } },
            },
          }),
        },
      },
    },
    // ===== 认证 =====
    '/api/login': {
      post: {
        tags: ['认证'], security: [], summary: '登录',
        requestBody: jsonBody({
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string', example: 'admin' },
            password: { type: 'string', example: '123456' },
            remember: { type: 'boolean', description: '记住登录：token 7 天 / 1 天' },
          },
        }),
        responses: {
          ...okResp({ $ref: '#/components/schemas/LoginResp' }),
          400: { description: '账号或密码为空' },
          401: { description: '账号或密码错误（不区分账号不存在/密码错误）' },
          403: { description: '账号已被禁用' },
        },
      },
    },
    '/api/users/me': {
      get: { tags: ['认证'], summary: '当前用户信息', responses: { ...okResp({ $ref: '#/components/schemas/User' }), 401: { description: '未登录/登录过期/账号被禁用' } } },
    },
    // ===== 工单 =====
    '/api/orders': {
      get: {
        tags: ['工单'], summary: '工单列表（按角色过滤数据范围；筛选条件 AND 组合；按创建时间倒序）',
        parameters: [
          { name: 'keyword', in: 'query', schema: { type: 'string' }, description: '按标题/工单号模糊匹配' },
          { name: 'dept', in: 'query', schema: { type: 'string' }, description: '部门精确匹配' },
          { name: 'type', in: 'query', schema: { type: 'string' }, description: '类型精确匹配' },
          { name: 'status', in: 'query', schema: { type: 'string' }, description: '状态精确匹配' },
          { name: 'priority', in: 'query', schema: { type: 'string' }, description: '优先级精确匹配' },
          { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' }, description: '创建日期起（含）' },
          { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' }, description: '创建日期止（含）' },
          { name: 'submitterId', in: 'query', schema: { type: 'integer' }, description: '提交人 id（用于用户详情页筛选）' },
          { name: 'handlerId', in: 'query', schema: { type: 'integer' }, description: '处理人 id（用于处理人工作量筛选）' },
        ],
        responses: { ...okResp({ type: 'array', items: { $ref: '#/components/schemas/Order' } }), 400: { description: '参数不合法' } },
      },
      post: {
        tags: ['工单'], summary: '创建工单（随机工单号；提交人=当前用户）',
        requestBody: jsonBody({
          type: 'object',
          required: ['title', 'dept', 'type', 'priority', 'description'],
          properties: {
            title: { type: 'string', maxLength: 30 },
            dept: { type: 'string', enum: ['技术部', '市场部', '财务部', '人事部', '行政部'] },
            type: { type: 'string', enum: ['账号权限', '设备故障', '网络异常', '系统BUG', '其他需求'] },
            priority: { type: 'string', enum: ['高', '中', '低'] },
            deadline: { type: 'string', example: '2026-12-31 18:00' },
            description: { type: 'string', minLength: 5 },
            attachments: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, url: { type: 'string' } } } },
            extra: { type: 'object' },
          },
        }),
        responses: { ...okResp({ $ref: '#/components/schemas/OrderDetail' }, '创建成功（201）'), 400: { description: '字段校验失败' }, 201: { description: '创建成功' } },
      },
    },
    '/api/orders/batch-close': {
      post: {
        tags: ['工单'], summary: '批量关闭（部长/超管；仅关闭可见且状态为待处理/处理中的工单）',
        requestBody: jsonBody({ type: 'object', required: ['ids'], properties: { ids: { type: 'array', maxItems: 100, items: { type: 'string' } } } }),
        responses: { ...okResp({ type: 'object', properties: { count: { type: 'integer', description: '实际关闭数' } } }), 403: { description: '普通员工无权限' } },
      },
    },
    '/api/orders/{id}': {
      get: {
        tags: ['工单'], summary: '工单详情（含处理记录；无权查看返回 404）',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { ...okResp({ $ref: '#/components/schemas/OrderDetail' }), 404: { description: '不存在或无权查看（不区分，防探测）' } },
      },
      put: {
        tags: ['工单'], summary: '编辑工单（提交人本人/部长/超管；仅待处理/处理中/已退回可编辑）',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: jsonBody({ $ref: '#/components/schemas/Order' }),
        responses: { ...okResp({ $ref: '#/components/schemas/OrderDetail' }), 403: { description: '普通员工只能编辑自己提交的' }, 404: { description: '不存在或无权' }, 409: { description: '当前状态不允许编辑' } },
      },
      delete: {
        tags: ['工单'], summary: '删除工单（仅超管，软删除）',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { ...okResp({ type: 'object', properties: { id: { type: 'string' } } }), 403: { description: '仅超管' } },
      },
    },
    '/api/orders/{id}/status': {
      patch: {
        tags: ['工单'], summary: '状态流转（部长/超管）。accept：待处理/已退回→处理中（handler=操作人）；reject：→已退回（reason 必填）；complete：→已完成（写完成时间）；close：已完成→已关闭',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: jsonBody({
          type: 'object',
          required: ['action'],
          properties: {
            action: { type: 'string', enum: ['accept', 'reject', 'complete', 'close'] },
            reason: { type: 'string', description: 'action=reject 时必填' },
          },
        }),
        responses: { ...okResp({ $ref: '#/components/schemas/OrderDetail' }), 400: { description: 'action 不合法/reason 缺失' }, 403: { description: '普通员工无权限' }, 409: { description: '当前状态不允许该操作' } },
      },
    },
    '/api/orders/{id}/assign': {
      patch: {
        tags: ['工单'], summary: '分配工单（部长/超管；仅待处理/已退回可分配；处理人须为启用账号）',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: jsonBody({ type: 'object', required: ['handlerId'], properties: { handlerId: { type: 'integer' } } }),
        responses: { ...okResp({ $ref: '#/components/schemas/OrderDetail' }), 400: { description: '处理人不存在或已禁用' }, 409: { description: '当前状态不允许分配' } },
      },
    },
    '/api/orders/{id}/urge': {
      patch: {
        tags: ['工单'], summary: '催办（提交人本人/部长/超管；仅待处理/处理中）',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { ...okResp({ $ref: '#/components/schemas/OrderDetail' }), 403: { description: '普通员工仅限催办自己提交的' }, 409: { description: '当前状态不允许催办' } },
      },
    },
    // ===== 统计 =====
    '/api/stats/overview': {
      get: {
        tags: ['统计'], summary: '首页指标 + 状态分布（按角色范围计算，软删除不计入）',
        responses: { ...okResp({ $ref: '#/components/schemas/StatsOverview' }) },
      },
    },
    '/api/stats/trend': {
      get: {
        tags: ['统计'], summary: '工单趋势（逐日补零）',
        parameters: [{ name: 'days', in: 'query', schema: { type: 'integer', enum: [7, 30], default: 7 } }],
        responses: { ...okResp({ type: 'array', items: { $ref: '#/components/schemas/TrendPoint' } }), 400: { description: 'days 仅支持 7/30' } },
      },
    },
    '/api/stats/workload': {
      get: {
        tags: ['统计'], summary: '处理人工作量（部长/超管）',
        responses: { ...okResp({ type: 'array', items: { $ref: '#/components/schemas/WorkloadRow' } }), 403: { description: '普通员工无权限' } },
      },
    },
    // ===== 用户管理 =====
    '/api/users': {
      get: {
        tags: ['用户管理'], summary: '用户列表（超管全部 / 部长本部门只读 / 员工 403）',
        responses: { ...okResp({ type: 'array', items: { $ref: '#/components/schemas/User' } }), 403: { description: '普通员工无权限' } },
      },
      post: {
        tags: ['用户管理'], summary: '创建用户（仅超管；默认密码 123456；重名 409）',
        requestBody: jsonBody({
          type: 'object',
          required: ['username', 'name', 'role', 'dept'],
          properties: {
            username: { type: 'string', pattern: '^[a-z0-9_.-]{2,50}$' },
            name: { type: 'string', maxLength: 50 },
            role: { type: 'string', enum: ['超级管理员', '部长', '普通员工'] },
            dept: { type: 'string', enum: ['技术部', '市场部', '财务部', '人事部', '行政部'] },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 6, description: '不传默认 123456' },
          },
        }),
        responses: { ...okResp({ $ref: '#/components/schemas/User' }, '创建成功（201）'), 409: { description: '用户名已存在' }, 201: { description: '创建成功' } },
      },
    },
    '/api/users/{id}': {
      get: {
        tags: ['用户管理'], summary: '用户详情（超管任意 / 部长本部门 / 员工仅自己；无权一律 404）',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { ...okResp({ $ref: '#/components/schemas/User' }), 404: { description: '用户不存在或无权查看（不区分，防探测）' } },
      },
      put: {
        tags: ['用户管理'], summary: '编辑用户（仅超管；username 不可改）',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: jsonBody({
          type: 'object', required: ['name', 'role', 'dept'],
          properties: {
            name: { type: 'string' },
            role: { type: 'string', enum: ['超级管理员', '部长', '普通员工'] },
            dept: { type: 'string', enum: ['技术部', '市场部', '财务部', '人事部', '行政部'] },
            email: { type: 'string' },
          },
        }),
        responses: { ...okResp({ $ref: '#/components/schemas/User' }), 404: { description: '用户不存在' } },
      },
      delete: {
        tags: ['用户管理'], summary: '删除用户（仅超管；有工单引用返回 409 引导禁用；不能删除自己）',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { ...okResp({ type: 'object', properties: { id: { type: 'integer' } } }), 400: { description: '不能删除当前登录账号' }, 409: { description: '存在工单记录，请使用禁用' } },
      },
    },
    '/api/users/{id}/status': {
      patch: {
        tags: ['用户管理'], summary: '启用/禁用（仅超管；禁用后该用户已签发 token 立即失效）',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: jsonBody({ type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['启用', '禁用'] } } }),
        responses: { ...okResp({ $ref: '#/components/schemas/User' }), 400: { description: '不能禁用自己' } },
      },
    },
    '/api/users/{id}/password': {
      patch: {
        tags: ['用户管理'], summary: '重置密码为 123456（仅超管）',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { ...okResp({ type: 'object', properties: { id: { type: 'integer' } } }) },
      },
    },
    // ===== 附件 =====
    '/api/upload': {
      post: {
        tags: ['附件'], summary: '上传附件（multipart/form-data，字段名 file；≤5MB；白名单类型）',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
            },
          },
        },
        responses: {
          ...okResp({ type: 'object', properties: { name: { type: 'string', description: '原始文件名' }, url: { type: 'string', description: '访问地址，直接填入工单 attachments' } } }, '上传成功（201）'),
          400: { description: '类型不支持' }, 413: { description: '超过 5MB' }, 201: { description: '上传成功' },
        },
      },
    },
  },
}
