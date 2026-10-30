# 超管页面功能 → 后端接口映射

> 以下为"超级管理员工作台"各页面功能点，按**接口路由 + Query + 返回字段**逐项列出。
> 已实现接口直接引用；未覆盖的模糊需求（如"通知渠道配置"）标注为"可暂缓/后续扩展"。

---

## 一、工单工作台

### 1.1 全部工单列表
**后端接口（已实现）：**

| 方法 | 路由 | 说明 |
|---|---|---|
| GET | `/api/tickets` | 列表（返回权限范围内全量，created_at 倒序） |
| GET | `/api/tickets/:id` | 详情（含当前轮 approval_records 摘要） |
| POST | `/api/tickets` | 创建草稿 / 直接提交 |
| PUT | `/api/tickets/:id` | 编辑（仅 draft 且申请人本人） |
| POST | `/api/tickets/:id/actions` | 统一动作网关（20 动作） |
| GET | `/api/tickets/export` | CSV 导出（仅超管） |

**列表 Query：**

| 参数 | 类型 | 说明 |
|---|---|---|
| keyword | string | title 或 id 模糊 |
| type | enum | fault_repair / account_permission / reimbursement |
| status | enum | 10 态枚举 |
| priority | string | 字典 code |
| dept | string | 部门名称 |
| handlerId | number | 处理人 ID |
| dateFrom / dateTo | string | YYYY-MM-DD |
| archived | boolean | 默认 false |
| escalated | boolean | 仅 escalated_level ≥ 1（曾被升级） |
| slaExempt | boolean | 仅已豁免 SLA 考核 |
| suspendedDays | number | status=suspended 且挂起 ≥ N 天 |

**列表每条字段：** Ticket 对象 + `overallSla?`（当前活跃 overall 记录）

**详情额外字段：** `approvals: Approval[]`（当前轮审批节点摘要，含 actedByName 代执行徽标）

### 1.2 全局数据分析看板

#### 1.2.1 综合统计大盘
**后端接口（已实现）：**

| 方法 | 路由 | 说明 |
|---|---|---|
| GET | `/api/stats/overview` | 聚合规模 |
| GET | `/api/stats/trend` | 趋势（含同期对比） |
| GET | `/api/stats/status-distribution` | 状态分布 + 超时未完结 |
| GET | `/api/stats/sla` | SLA 超时率总览 |
| GET | `/api/stats/workload` | 人员工作量 |

**通用 Query：**

| 参数 | 类型 | 说明 |
|---|---|---|
| period | enum | day / week / month / quarter / year（默认 month） |
| date | string | YYYY-MM-DD，周期锚点（默认当前） |

**各接口返回字段：**

`/api/stats/overview`：`{ total, created, closed, unclosed, cancelled, rejected }`
- rejected = 周期内 `ticket_logs.action = 'reject_approval'` 的次数

`/api/stats/trend`：
```
{
  current:  [{ bucket: '2026-10-22', created: 3, closed: 1, breached: 0 }],
  previous: [{ bucket, created, closed, breached }]   // 上一等长周期同期序列
}
```

`/api/stats/status-distribution`：
```
{
  list: [{ status, count, ratio }],  // 固定 10 状态，count=0 也返回
  overdueOpen: 42                    // overall is_breached 且非终态
}
```

`/api/stats/sla`：
```
{
  overallRate: 3.2,        // %
  responseRate: 1.5,
  approvalRate: 0.8,
  processingRate: 5.1,
  breachedCount: 12,
  avgBreachedDuration: 1800000  // 毫秒
}
```

`/api/stats/workload`：
```
{
  list: [{ userId, name, accepted, processed, closed, rejected, cancelled }],
  avgPerPerson: 3.6
}
```

#### 1.2.2 工单明细报表
**后端接口（已实现）：**
- GET `/api/stats/sla/details` — 超时工单明细（含 breachedDuration）
- GET `/api/tickets` — 带筛选的工单列表（可作为明细报表数据源）

#### 1.2.3 SLA 超时分析报表
**后端接口（已实现）：**
- GET `/api/stats/sla` — 各指标超时率总览
- GET `/api/stats/sla/details` — 超时工单明细（ticketId / title / metricType / breachedDuration / handlerName / dept）
- GET `/api/sla-records` — SLA 计时监控列表（running/breached/paused）

#### 1.2.4 报表导出
**后端接口（已实现）：**

| 方法 | 路由 | 说明 |
|---|---|---|
| GET | `/api/stats/export` | 统计报表 CSV；Query：module=overview/workload/sla/trend/status + period/date |
| GET | `/api/tickets/export` | 工单列表 CSV；Query 同 `/api/tickets` |

### 1.3 我的待办
**后端接口（已实现）：**

| 方法 | 路由 | 说明 |
|---|---|---|
| GET | `/api/tickets/todo` | 聚合待办（handleList / approveList / financeList 仅超管返回） |

**返回：**
```
{
  handleList: Ticket[],      // 我的处理中 + 本人申请待确认
  approveList: Ticket[],     // 当前节点我是审批人（部长 L1 / 超管 L1+L2）
  financeList: Ticket[]      // 仅超管；assignee_role = builtin_finance 待处理报销单
}
```

**所有 Ticket 附带 overallSla（倒计时渲染用）**

### 1.4 异常工单管理
**后端接口（已实现）：**

| 方法 | 路由 | 说明 |
|---|---|---|
| GET | `/api/tickets/abnormal` | 异常工单聚合；Query：**abnormalType**（必填）+ 列表接口通用筛选 |
| GET | `/api/tickets` | 带 escalated / slaExempt / suspendedDays 筛选的列表 |
| GET | `/api/tickets/:id/sla-events` | 工单 SLA 事件时间线（异常详情页 SLA 链溯源用） |
| GET | `/api/stats/sla/details` | 超时工单明细（含 breachedDuration） |

**abnormalType 枚举：**

| abnormalType | 说明 | 额外参数 |
|---|---|---|
| sla_breach | overall SLA 已超时且非终态 | — |
| escalated | 曾被升级（escalated_level ≥ 1） | — |
| sla_exempt | 已豁免 SLA 考核（sla_exempt = true） | — |
| long_suspended | 挂起超过 N 天 | suspendedDays（默认 7） |

**列表接口 Query 新增：** escalated / slaExempt / suspendedDays（与 abnormalType 互补，abnormal 按"异常类型"分组返回，列表按通用筛选自由组合）

---

## 二、用户与角色权限管理

### 2.1 用户账号管理
**后端接口（已实现）：**

| 方法 | 路由 | 说明 | 角色 |
|---|---|---|---|
| GET | `/api/users` | 全量列表（不含密码哈希） | 超管 |
| POST | `/api/users` | 创建；初始密码固定 123456；username 唯一 409 | 超管 |
| PUT | `/api/users/:id` | 改 name / role / dept / email（username 不可改） | 超管 |
| PATCH | `/api/users/:id/status` | `{ status: '启用' / '禁用' / '锁定' }` | 超管 |
| PATCH | `/api/users/:id/password` | 重置为 123456 | 超管 |
| DELETE | `/api/users/:id` | 名下有工单 → 409 提示改用禁用；不能删自己 | 超管 |

### 2.2 角色权限配置
**后端接口（已实现）：**

| 方法 | 路由 | 说明 |
|---|---|---|
| GET | `/api/role-permissions` | 角色-权限码矩阵（全员可用，前端按钮显隐数据源） |
| PUT | `/api/role-permissions` | 整组替换 `{ permissions: [{ role, permCode }] }`（仅超管） |

**返回字段：** `[{ role: '超级管理员', permCode: 'ticket:assign' }]`

### 2.3 审计日志查询
**后端接口（已实现）：**

| 方法 | 路由 | 说明 | 角色 |
|---|---|---|---|
| GET | `/api/audit-logs` | 配置与权限变更审计 | 超管 |
| GET | `/api/login-logs` | 登录留痕 | 超管 |

**audit-logs Query：** actorId / targetType / targetId / dateFrom / dateTo
**audit-logs 字段：** id / actorId / actorName / targetType / targetId / action / before / after / createdAt

**login-logs Query：** username（模糊）/ success（true/false）/ dateFrom / dateTo
**login-logs 字段：** id / userId / userName / username / success / ip / userAgent / createdAt

---

## 三、系统流程基础配置

### 3.1 字典数据管理
**后端接口（已实现）：**

| 方法 | 路由 | 说明 | 角色 |
|---|---|---|---|
| GET | `/api/dictionaries?dict_type=` | 字典列表（可按 type 过滤） | 全员 |
| POST | `/api/dictionaries` | 新增 `{ dictType, code, label, sort? }` | 超管 |
| PUT | `/api/dictionaries/:id` | 改 label / sort / active；code 不可改 | 超管 |

**预设 dict_type：** priority / ticket_type / ticket_status / fault_category / sla_metric

### 3.2 工单流程配置（审批节点）
**后端接口（已实现）：**

| 方法 | 路由 | 说明 | 角色 |
|---|---|---|---|
| GET | `/api/approval-flows?ticket_type=` | 审批节点定义列表 | 全员 |
| PUT | `/api/approval-flows/:id` | 改 node_name / skip_rule / active | 超管 |

**禁止在线修改：** seq（顺序）、approver_strategy（审批人策略）

**返回字段：** id / ticketType / seq / nodeName / approverStrategy / skipRule / active

### 3.3 SLA 服务等级配置
**后端接口（已实现）：**

| 方法 | 路由 | 说明 | 角色 |
|---|---|---|---|
| GET | `/api/sla-rules?ticket_type=` | SLA 规则列表（含历史版本 + 关联日历名） | 全员 |
| POST | `/api/sla-rules` | 新增版本 `{ ticketType, metricType, priority?, nodeSeq?, targetValue, targetUnit, calendarId?, warningThresholds?, repeatRemindInterval? }` | 超管 |
| PATCH | `/api/sla-rules/:id` | 启停（仅改 active；版本内容不可改） | 超管 |

### 3.4 表单模板配置（自定义字段）
**后端接口（已实现）：**

| 方法 | 路由 | 说明 | 角色 |
|---|---|---|---|
| GET | `/api/form-configs?ticket_type=` | 自定义字段列表 | 全员 |
| POST | `/api/form-configs` | 新增 `{ ticketType, fieldKey, label, fieldType, required?, options?, sort? }` | 超管 |
| PUT | `/api/form-configs/:id` | 编辑（不可物理删，active=false 下线） | 超管 |

**fieldType 枚举：** text / textarea / number / select / date

---

## 四、系统参数设置

### 4.1 系统通用参数
**后端接口（已实现）：**

| 方法 | 路由 | 说明 | 角色 |
|---|---|---|---|
| GET | `/api/system-params` | 参数列表 | 全员 |
| PUT | `/api/system-params/:key` | 改 value（JSON 字符串化存库） | 超管 |

**预设参数 key：**

| key | 说明 | 默认值 |
|---|---|---|
| reopen_window_days | 工单重开时限（天） | 7 |
| upload_max_mb | 附件上限（MB） | 5 |
| login_max_retry | 连续失败自动锁定次数 | 5 |
| sla_scan_interval_sec | SLA 扫描器周期（秒，下限 10） | 60 |

### 4.2 工作日历维护
**后端接口（已实现）：**

| 方法 | 路由 | 说明 | 角色 |
|---|---|---|---|
| GET | `/api/work-calendars` | 日历列表（含 specialDays：holiday / extra_workday） | 全员 |
| PUT | `/api/work-calendars/:id` | 整组替换（calendar_special_days 先删后插） | 超管 |

**请求体结构：**
```
{
  name: '标准工作日历',
  workDays: [1, 2, 3, 4, 5],   // 0=周日，1=周一
  dayStart: '09:00',
  dayEnd: '18:00',
  breaks: [['12:00','13:00']],
  active: true,
  specialDays: [
    { day: '2026-10-01', kind: 'holiday', name: '国庆节' },
    { day: '2026-09-27', kind: 'extra_workday', name: '国庆调休' }
  ]
}
```

---

## 五、通知与消息配置

### 5.1 通知模板管理
**后端接口（已实现）：**

| 方法 | 路由 | 说明 | 角色 |
|---|---|---|---|
| GET | `/api/notification-templates` | 模板列表 | 全员 |
| PUT | `/api/notification-templates/:id` | 改 title / content | 超管 |

**模板内占位符：** `{变量名}`，发送时按业务上下文填充（如 `{id}` / `{title}` / `{reason}`）

**业务触发点（已实现，后端自动触发）：**

| 事件 | 接收人 | 模板 code |
|---|---|---|
| assign / reassign / transfer | 新处理人 | ticket_assigned |
| approve（末节点） | 申请人 | ticket_approved |
| reject_approval | 申请人 | ticket_rejected |
| resolve | 申请人 | ticket_resolved |
| escalate | 本部门部长 + 全部超管 | ticket_escalated |
| SLA 预警（首次命中阈值） | 处理人 + 本部门部长 | sla_warning |
| SLA 超时 | 处理人 + 本部门部长 | sla_breached |

### 5.2 通知渠道配置
> 后端暂未实现。当前通知渠道为 **仅站内**（写 notifications 表）。如后续扩展邮件 / 短信 / 企业微信，可在 system_params 或新建 notification_channels 表配置 webhook / SMTP / access_token。

---

## 六、其他通用能力

### 附件上传
| 方法 | 路由 | 说明 |
|---|---|---|
| POST | `/api/upload` | multipart 字段 `file`；上限读 system_params.upload_max_mb；返回 `{ name, url }` |

### 健康检查
| 方法 | 路由 | 说明 |
|---|---|---|
| GET | `/api/health` | 无需登录；`{ status, db }` |

### 通用字典（提交表单 / 筛选控件数据源）
| 方法 | 路由 | 说明 |
|---|---|---|
| GET | `/api/dictionaries?dict_type=` | 全员可用 |
| GET | `/api/role-permissions` | 前端按钮显隐数据源（需登录） |

### 认证
| 方法 | 路由 | 说明 |
|---|---|---|
| POST | `/api/login` | `{ username, password, remember }` → `{ token, user }` |
| GET | `/api/users/me` | 刷新当前登录态 |

---

## 七、后端未实现的功能（建议后续扩展）

| 功能点 | 现状 | 建议 |
|---|---|---|
| 通知渠道配置 | 仅站内（写 notifications 表） | 后续扩展邮件/企业微信/SMTP（在 system_params 或新建 notification_channels 表配置 webhook / SMTP / access_token） |
| 工单批量操作（批量关闭/批量指派） | 未实现 | 暂用逐个 POST /actions；批量可后续新增 `POST /api/tickets/batch-actions` |
| 工单收藏 / 订阅 | 未实现 | 后续加 tickets.favorited_by jsonb 或新建 user_ticket_subscriptions 表 |
