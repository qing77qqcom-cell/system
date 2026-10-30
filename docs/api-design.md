# 接口设计（依据《完整业务权限规则文档》《数据分析权限独立设计文档》）

> 配套库表设计见 `database-design.md`。REST 风格，统一前缀 `/api`。
> 核心原则（文档强制）：前端只做显隐，**所有权限、动作、数据范围由后端逐请求动态校验**。

## 0. 通用约定

| 项 | 约定 |
|---|---|
| 认证 | JWT Bearer（`Authorization: Bearer <token>`）；每个受保护接口回查 `users.status`（禁用/锁定立即 401） |
| 响应信封 | 成功 `{ code:0, message:'ok', data:... }`；失败 `{ code:<业务码>, message:'中文提示' }` |
| 无权限提示 | 统一 `无权限执行该操作`（与文档 §七-4 一致） |
| 数据范围越权 | 工单级不可见一律 **404**（不暴露存在性） |
| 状态不支持动作 | **409** `当前状态不允许该操作` |
| 时间格式 | `YYYY-MM-DD HH:mm`（Asia/Shanghai） |
| 分页排序 | 前端做；列表接口返回权限范围内全量 |
| 幂等 | 写操作接受 `business_event_id` 请求头或 `payload.business_event_id` 字段；重复请求返回首次结果 |
| 并发控制 | 写操作 payload 可选 `version`（乐观锁）；不传则跳过版本校验 |

### 0.1 数据范围规则（所有工单/统计接口的第一道过滤）

| 角色 | 范围 |
|---|---|
| 超级管理员 | 全平台 + 内置财务部待办队列 |
| 技术部部长 | `tickets.dept = 本部门`；**排除**财务待办视图 |
| 技术部普通员工 | `applicant_id = me OR current_handler_id = me` |

### 0.2 动作权限矩阵（后端校验源；✔=允许，—=禁止）

| 动作 | 超管 | 部长 | 员工 | 附加条件 |
|---|---|---|---|---|
| submit / supplement | ✔ | ✔ | ✔ | supplement 仅申请人、非终态 |
| cancel | ✔ | ✔(本人) | ✔(本人) | 非终态 |
| assign / reassign | ✔ | ✔(本部门故障单) | — | 仅故障报修 |
| accept / start / resolve | ✔(兜底) | — | ✔(当前处理人) | 超管仅异常兜底，不作日常 |
| transfer | ✔ | ✔(本部门) | — | |
| approve / reject_approval | ✔ | ✔(本部门 L1) | — | 报销 L2 仅超管（代财务）；报销 L1 超管可兜底 |
| confirm | ✔ | ✔(本人申请) | ✔(本人申请) | 仅故障报修 |
| suspend / resume | ✔ | ✔(本部门) | — | |
| reopen | ✔ | ✔(本部门) | ✔(本人+限时) | 必须填原因 |
| escalate / change_priority | ✔ | ✔(本部门) | — | |
| sla_exempt | ✔ | ✔(本部门) | — | 该单活跃 sla_records 置 cancelled |
| mark_paid | ✔(代财务) | — | — | 仅报销单、待付款态 |
| 统计报表导出 | ✔ | — | — | 部长/员工无导出权限 |
| 系统配置/账号管理/日志查看 | ✔ | — | — | |

### 0.3 数据对象定义

#### Ticket（工单主对象）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 单号，格式 `WO` + `yyyymmdd` + 4 位随机（如 `WO202610221234`） |
| type | enum | `fault_repair` / `account_permission` / `reimbursement` |
| status | enum | 10 态枚举（见 database-design.md §2） |
| priority | string | 对应 `sys_dictionaries(priority)` |
| faultCategory | string \| null | 仅 `fault_repair` 类型；对应 `sys_dictionaries(fault_category)` |
| title | string | 标题 ≤ 200 字 |
| description | string \| null | 问题描述 |
| dept | string | 归属部门 |
| applicantId / applicant | number / string | 申请人 ID / 姓名 |
| handlerId / handler | number / string \| null | 当前处理人 ID / 姓名 |
| currentRound | number | 当前审批轮次（驳回重提 +1） |
| escalatedLevel | number | 升级次数 |
| slaExempt | boolean | SLA 是否豁免 |
| reopenCount | number | 重开次数 |
| extra | object | 按 `form_field_configs` 自定义字段 |
| attachments | string[] | 附件 URL 列表 |
| version | number | 乐观锁版本号 |
| firstSubmittedAt | string | 首次提交时间（驳回重提不重置） |
| closedAt | string \| null | 关闭/取消时间 |
| archivedAt | string \| null | 归档时间 |
| createdAt / updatedAt | string | 创建/更新时间 |

#### Ticket（列表接口附带）

| 字段 | 类型 | 说明 |
|---|---|---|
| overallSla | object \| null | 当前活跃的 overall SLA 记录（仅计时相关字段） |
| overallSla.slaStatus | enum | pending / running / paused / breached（终态不出现在列表） |
| overallSla.deadlineAt | string | 截止时间（Asia/Shanghai） |
| overallSla.isBreached | boolean | 是否已超时 |

#### Approval（审批节点摘要，工单详情内嵌）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | number | |
| round | number | 审批轮次 |
| seq | number | 本轮内序号 |
| nodeName | string | 节点名称 |
| assigneeId / assignee | number / string \| null | 审批人 ID / 姓名（内置财务节点为 null） |
| assigneeRole | string | 角色名或 `builtin_finance` |
| status | enum | pending / approved / rejected / skipped / cancelled |
| comment | string \| null | 审批意见 |
| assignedAt / actedAt | string \| null | 分配时间 / 审批时间 |
| actedBy / actedByName | number / string \| null | 实际操作人（代执行时与 assignee 不同） |
| actedAs | string \| null | 代执行角色标识（如 `builtin_finance`） |

#### Log（时间线日志）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | number | |
| action | enum | 20 动作枚举 |
| fromStatus / toStatus | enum \| null | 状态机起点 / 终点 |
| user | string | 操作人姓名（代执行时附加 `（代财务部角色）` 后缀；系统动作则为 `系统`） |
| operatorId | number \| null | 操作人 ID |
| triggerSource | enum | user / scheduler / business_event / system_rule |
| remark | string | 备注/理由 |
| metadata | object \| null | 附加上下文（如 `{ proxy:'builtin_finance' }`、`{ from:..., to:... }`、`{ level:... }`、`{ toHandler:... }`） |
| time | string | 时间（Asia/Shanghai） |

#### SlaRecord（工单 SLA 明细）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | number | |
| metricType | enum | 6 指标（见 database-design.md §2） |
| slaStatus | enum | pending / running / paused / breached / met / breached_closed / cancelled |
| targetDuration | number | 目标时长（毫秒） |
| elapsedDuration | number | **实时已消耗时长**（毫秒），由后端按工作日历动态计算，前端不得自行计算 |
| deadlineAt | string \| null | 截止时间（paused 时为 null） |
| isBreached | boolean | 是否已超时 |
| breachedDuration | number | 累计超时时长（毫秒），已完结才会有 |
| ruleVersion | number | 命中的 sla_rules 版本号 |

---

## 1. 认证

### POST /api/login
- 请求：`{ username, password, remember? }`；remember=true → token 有效期 7 天，否则 1 天
- 成功 `200`：`data: { token, user }`
- user 对象：`{ id, username, name, role, dept, email, status, createdAt }`
- 失败：`401` 账号或密码错误；`403` 账号已禁用/锁定
- 行为：成功与失败均写 login_logs；连续失败达 `system_params.login_max_retry` 自动将用户状态改为 `锁定`

### GET /api/users/me
- 鉴权：需要 Bearer token
- 成功 `200`：当前 user 对象（刷新恢复登录态）

---

## 2. 工单

### GET /api/tickets —— 列表
- 鉴权：需要 Bearer token
- Query（均可选，AND 组合）：`keyword`（title/id 模糊）、`type`、`status`、`priority`、`dept`、`dateFrom`（≥，YYYY-MM-DD）、`dateTo`（< 次日，YYYY-MM-DD）、`handlerId`、`archived`（默认 false，仅看未归档）、`escalated`（true/false，按 escalated_level ≥ 1 过滤）、`slaExempt`（true/false，按 sla_exempt 过滤）、`suspendedDays`（整数，status=suspended 且挂起 ≥ N 天）
- 后端自动追加 §0.1 数据范围过滤（角色 > 前端筛选，无法越权）
- 成功 `200`：`data: Ticket[]`，按 `created_at` 倒序；每条附带 `overallSla`（null 表示无活跃 overall 记录）

### GET /api/tickets/:id —— 详情
- 鉴权：需要 Bearer token
- 成功 `200`：`data: Ticket + approvals`（`approvals` 为当前轮审批节点摘要）
- 失败：`404` 不存在或无权（不暴露存在性）

### POST /api/tickets —— 创建
- 鉴权：需要 Bearer token
- 请求体：
  ```json
  {
    "type": "fault_repair",          // 必填；枚举值
    "title": "服务端口不通",           // 必填；≤ 200 字
    "priority": "high",              // 可选；sys_dictionaries(priority) 中存在的 code
    "faultCategory": "network",      // 仅 fault_repair 类型；sys_dictionaries(fault_category)
    "description": "测试机 ping 不通",  // 可选
    "attachments": ["/uploads/xxx.pdf"],  // 可选；URL 数组
    "extra": { "影响范围": "机房A" },   // 可选；按 form_field_configs 校验
    "submit": true,                   // 可选；false 或缺省存草稿；true 直接提交 → pending_approval
    "dept": "技术部"                   // 可选；超管可指定归属部门；缺省取申请人 dept，再兜底"技术部"
  }
  ```
- 响应：`201` `data: Ticket`

### PUT /api/tickets/:id —— 编辑草稿
- 鉴权：需要 Bearer token
- 前置条件：`status = draft` 且 `applicant_id = me`
- 可编辑字段：`title`、`priority`、`faultCategory`、`description`、`attachments`、`extra`；`type` 不可改
- 响应：`200` `data: Ticket`

### POST /api/tickets/:id/actions —— 统一动作网关
- 鉴权：需要 Bearer token
- 请求体：`{ action, version?, business_event_id?, ...payload }`
- 校验顺序（文档强制）：**登录 → 角色动作权限（403）→ 数据范围（404）→ 状态机白名单（409）→ payload（400）**
- 行为：状态 UPDATE + approval_records + ticket_logs + payment_records **同事务**；通知异步发送（不阻塞写操作）
- version 乐观锁：payload.version 提供时必须匹配数据库当前版本，否则 409
- 幂等：business_event_id 重复请求直接返回当前 Ticket

动作 payload 与效果：

| action | payload | 前置状态 | 效果 |
|---|---|---|---|
| submit | — | draft | →pending_approval；round+1；建新轮审批记录；启动 overall（仅首轮，first_submitted_at 不重置）与 first_response SLA |
| approve | `{ comment?, business_event_id? }` | pending_approval | 推进节点；命中 skip_rule 自动跳过；末节点按类型落态：故障→pending_assignment / 账号→pending_processing（handler=操作人）/ 报销→pending_processing；approval + first_response SLA 完结 |
| reject_approval | `{ comment }` 必填 | pending_approval | →draft（驳回一律回 draft，无 rejected 态）；approval + first_response SLA 完结 |
| assign | `{ handlerId }` 必填 | pending_assignment | →pending_acceptance；仅故障报修；first_response SLA 完结 |
| reassign | `{ handlerId }` 必填 | pending_acceptance | 换处理人（状态不变）；仅故障报修 |
| accept | — | pending_acceptance | →pending_processing；handler=操作人；processing SLA 启动 |
| transfer | `{ handlerId }` 必填 | pending_processing / processing | →pending_acceptance；新处理人需重新接单 |
| start | — | pending_processing | →processing |
| resolve | `{ result }` 必填 | processing | 故障→pending_confirmation（confirmation SLA 启动）+ processing SLA 完结；账号→closed（overall SLA 完结） |
| confirm | — | pending_confirmation | →closed；confirmation + overall SLA 完结 |
| supplement | `{ description?, attachments?, extra? }` | 非终态（含 suspended） | 追加材料，状态不变；仅申请人 |
| suspend | `{ reason }` 必填 | 活跃态 | →suspended；暂停 processing / confirmation / payment / overall SLA（first_response / approval 继续计时） |
| resume | — | suspended | →原状态（从 suspend 动作日志 metadata.prevStatus 还原）；被暂停 SLA 按剩余时长重算 deadline |
| cancel | `{ reason? }` | 非终态（含 draft / suspended） | →cancelled；当前轮 pending 审批记录同步取消；overall SLA 完结；其余活跃 SLA 终止不计考核 |
| reopen | `{ reason }` 必填 | closed | 员工限时（`system_params.reopen_window_days`，默认 7 天，仅本人）→pending_processing；部长/超管不限时；processing SLA 启动 |
| escalate | `{ reason? }` | 活跃态 | escalated_level+1；通知本部门部长 + 全部超管 |
| change_priority | `{ priority }` 必填 | 活跃态 | 更新优先级；ticket_logs.metadata 记 `{ from, to }` 前后值 |
| sla_exempt | `{ reason }` 必填 | 活跃态 | sla_exempt=true；所有活跃 SLA 置 cancelled |
| mark_paid | `{ voucherNo, amount, remark? }` | pending_processing / processing（仅报销单） | 写 payment_records（`acted_as='builtin_finance'`，超管代财务部）；→closed；payment + overall SLA 完结 |

响应：`200` `data: Ticket`（最新完整对象）

### GET /api/tickets/:id/logs —— 时间线
- 鉴权：需要 Bearer token；数据范围越权 404
- 成功 `200`：`data: Log[]`（按 created_at 升序）

### GET /api/tickets/export —— CSV 导出
- 鉴权：仅超管（403）
- Query 同列表接口（§2 GET /api/tickets）
- 成功 `200`：CSV 文件流（带 UTF-8 BOM，Excel 中文不乱码）；文件名为 `tickets-<时间戳>.csv`

### GET /api/tickets/:id/sla-records —— 工单 SLA 明细
- 鉴权：需要 Bearer token；数据范围越权 404
- 成功 `200`：`data: SlaRecord[]`（按 id 升序；elapsedDuration 后端实时计算，前端不得自行计算）

### GET /api/tickets/:id/sla-events —— SLA 事件时间线
- 鉴权：需要 Bearer token；数据范围越权 404
- 成功 `200`：`data: SlaEvent[]`（按 event_time 升序）

SlaEvent 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | number | |
| slaId | number | 关联的 sla_record |
| metricType | enum | 6 指标 |
| eventType | enum | 见 database-design.md §2 sla_event_type（sla_created / sla_started / sla_paused / sla_resumed / sla_warning / sla_breached / sla_completed / sla_closed_after_breach / sla_cancelled / sla_deadline_changed ...） |
| fromStatus / toStatus | string \| null | sla_record 的状态转换（sla_completed 时为 null，直接以 event_type 区分 met / breached_closed） |
| triggerSource | enum | user / scheduler / business_event / system_rule |
| operatorId | number \| null | 操作人（后端定时触发为 null） |
| reason | string \| null | 备注 |
| metadata | object \| null | 附加上下文 |
| elapsedMs | number \| null | 事件发生时已累计时长（毫秒；终态事件才有） |
| eventTime | string | 时间（Asia/Shanghai） |

### GET /api/sla-records —— SLA 计时监控列表
- 鉴权：超管（全部）/ 部长（本部门）；员工 403
- Query：`slaStatus`（running / breached / paused）、`metricType`、`ticketType`
- 成功 `200`：`data: [{ id, ticketId, ticketTitle, metricType, slaStatus, deadlineAt, isBreached, handlerName }]`

### GET /api/tickets/abnormal —— 异常工单聚合
- 鉴权：需要 Bearer token
- Query（`abnormalType` 必填；其余筛选参数复用列表接口）：

| abnormalType | 说明 |
|---|---|
| sla_breach | overall SLA 已超时且工单非终态 |
| escalated | escalated_level ≥ 1（曾被升级） |
| sla_exempt | sla_exempt = true（已豁免 SLA 考核） |
| long_suspended | status = suspended 且挂起 ≥ N 天；阈值默认 7，可被 `suspendedDays` 参数覆盖 |

- 成功 `200`：`data: (Ticket + abnormalTags)[ ]`；每条附带 `abnormalTags: string[]`（主标签；前端可再叠加 overallSla.isBreached 作为次级标签）
- 额外筛选参数（`escalated` / `slaExempt` / `suspendedDays`）与列表接口共用，可叠加其他条件（`dept` / `priority` / `dateFrom` / `dateTo` 等）

### GET /api/tickets/todo —— 我的待办聚合
- 鉴权：需要 Bearer token
- 返回：
  - handleList：我的处理中 + 本人申请待确认
  - approveList：当前节点我是审批人（含部长 L1 + 超管 L1/L2）
  - financeList（仅超管）：内置财务部队列 `assignee_role='builtin_finance' AND status='pending'`

---

## 3. 用户管理（仅超管）

| 接口 | 说明 |
|---|---|
| GET /api/users | 全量列表（不含密码哈希） |
| POST /api/users | 创建；username 唯一 409；初始密码固定 `123456`；超管 dept 可为 null |
| PUT /api/users/:id | 改 name / role / dept / email（username 不可改） |
| PATCH /api/users/:id/status | `{ status: '启用' \| '禁用' \| '锁定' }`；禁用/锁定即时失效，当前登录态自动 401 |
| PATCH /api/users/:id/password | 重置为 `123456` |
| DELETE /api/users/:id | 名下有工单 → 409 提示改用禁用；不能删除自己 |

全部写 audit_logs（before / after 完整快照）。

---

## 4. 系统配置（仅超管写；查询类接口除注明外全员可用）

| 接口 | 角色 | 说明 |
|---|---|---|
| GET /api/dictionaries?dict_type= | 全员 | 表单下拉数据；返回 active 项 |
| POST /api/dictionaries | 超管 | 新增字典项 `{ dictType, code, label, sort? }`；同类型 code 唯一（409） |
| PUT /api/dictionaries/:id | 超管 | 改 label / sort / active；**code 不可改**（会破坏已有数据关联） |
| GET /api/approval-flows?ticket_type= | 全员 | 审批节点定义列表 |
| PUT /api/approval-flows/:id | 超管 | 改 node_name / skip_rule / active；**seq 与 approver_strategy 不可在线改**（改策略 = 改流程语义，需发版） |
| GET /api/sla-rules?ticket_type= | 全员 | SLA 规则列表（含历史版本、关联日历名） |
| POST /api/sla-rules | 超管 | 新增规则**版本** `{ ticketType, metricType, priority?, nodeSeq?, targetValue, targetUnit, calendarId?, warningThresholds?, repeatRemindInterval? }`；同组自动 version+1；历史版本只读 |
| PATCH /api/sla-rules/:id | 超管 | active 启停（版本内容不可改） |
| GET /api/work-calendars | 全员 | 工作日历列表（含 special_days） |
| PUT /api/work-calendars/:id | 超管 | 整组替换：日历字段 + special_days（calendar_special_days 先删后插） |
| GET /api/form-configs?ticket_type= | 全员 | 自定义表单字段（渲染提交表单用） |
| POST /api/form-configs | 超管 | 新增 `{ ticketType, fieldKey, label, fieldType, required?, options?, sort? }` |
| PUT /api/form-configs/:id | 超管 | 编辑（不可物理删，active=false 下线） |
| GET /api/role-permissions | 全员 | 前端按钮显隐数据源；缓存使用 |
| PUT /api/role-permissions | 超管 | 整组替换 `{ permissions: [{ role, permCode }] }` |
| GET /api/notification-templates | 全员 | 通知模板列表 |
| PUT /api/notification-templates/:id | 超管 | 改 title / content（模板内支持 `{变量名}` 占位符） |
| GET /api/system-params | 全员 | 系统参数（重开窗口 / 附件上限 / 登录策略等） |
| PUT /api/system-params/:key | 超管 | 改 value（JSON 字符串化存库） |

所有配置变更写 audit_logs（actor + before/after）。

### SLA 规则字段补充

| 字段 | 说明 |
|---|---|
| targetValue + targetUnit | 60 minute / 8 work_hour / 24 work_day / 3 natural_day |
| calendarId | 工作单位时关联工作日历；natural_day 忽略 |
| warningThresholds | 可选；默认 `[50, 75, 90]`（百分比）；slaScheduler 扫描时首次命中阈值发预警 |
| repeatRemindInterval | PG interval 文本；如 `'2 hours'`；超期间隔重复发提醒 |

### 审批节点 skip_rule

```json
{ "applicant_role": "技术部普通员工" }  // 部长本人提交账号工单跳过一级审批
```

---

## 5. 日志查询（仅超管）

| 接口 | Query | 说明 |
|---|---|---|
| GET /api/login-logs | `username`（模糊）、`success`（true/false）、`dateFrom`、`dateTo` | 登录留痕（成功与失败都写） |
| GET /api/audit-logs | `actorId`、`targetType`、`targetId`、`dateFrom`、`dateTo` | 配置与权限变更审计 |

---

## 6. 通知

| 接口 | 鉴权 | 说明 |
|---|---|---|
| GET /api/notifications | 登录 | 我的站内通知（未读优先 + created_at 倒序） |
| PATCH /api/notifications/:id/read | 登录 | 标记已读（仅本人通知，越权 404） |
| PATCH /api/notifications/read-all | 登录 | 全部已读 |

通知触发点（异步 fire-and-forget，不进状态事务）：

| 事件 | 接收人 | 模板 code |
|---|---|---|
| 分配 assign / 改派 reassign / 转派 transfer | 新处理人 | ticket_assigned |
| 审批通过 approve（末节点） | 申请人 | ticket_approved |
| 审批驳回 reject_approval | 申请人 | ticket_rejected |
| 处理完成 resolve | 申请人 | ticket_resolved |
| 升级 escalate | 本部门部长 + 全部超管 | ticket_escalated |
| SLA 预警（首次命中阈值） | 处理人 + 本部门部长 | sla_warning |
| SLA 超时 | 处理人 + 本部门部长 | sla_breached |

通知模板 `business_event_id = '<eventKey>:<recipientId>'` 保证幂等，重试不会重复插入。

---

## 7. 统计（数据分析模块）

> 统计口径见 database-design.md §9。通用约定：
> - 全部接口支持 `period=day|week|month|quarter|year`（默认 month）+ `date`（周期锚点，默认当前日期）
> - **数据范围后端强制**：部长自动追加 `dept=本部门`，员工自动追加 `申请人/处理人=本人`；前端筛选（dept/type/priority）只能在范围内收窄——角色 > 筛选，改参数无法越权
> - 三角色均可调用（员工返回个人范围数据）；导出仅超管
> - 趋势分桶粒度：day→hour，week/month→day，quarter/year→month
> - 统计口径全部后端聚合，**不从前端工单列表遍历计算**

### GET /api/stats/overview —— 数据聚合规模
- 成功 `200`：`data: { total, created, closed, unclosed, cancelled, rejected }`
- `rejected` = 周期内 `ticket_logs.action = 'reject_approval'` 的次数

### GET /api/stats/workload —— 人员工作量
- 成功 `200`：`data: { list: [{ userId, name, accepted, processed, closed, rejected, cancelled }], avgPerPerson }`
- 超管：全员；部长：本部门；员工：仅本人一行
- 操作统计来自 `ticket_logs`（action 映射 accept/start/resolve/reject_approval/cancel）

### GET /api/stats/sla —— 超时率统计
- 成功 `200`：
  ```
  {
    overallRate,      // 整体超时率 %
    responseRate,     // 首次响应超时率 %
    approvalRate,     // 审批超时率 %
    processingRate,   // 处理超时率 %
    breachedCount,    // 超时记录数
    avgBreachedDuration  // 平均超时时长（毫秒）
  }
  ```
- 分母 = sla_records 周期内新增且 status ≠ cancelled 的记录数
- 豁免 cancelled 记录**不计入分母**（§5.6 豁免口径）

### GET /api/stats/sla/details —— 超时工单明细
- Query 同列表（keyword / type / status / priority / dept / dateFrom / dateTo / handlerId）
- 成功 `200`：`data: [{ ticketId, title, metricType, breachedDuration, handlerName, dept }]`
- 员工仅返回本人相关行

### GET /api/stats/trend —— 工单趋势（含同期对比）
- 成功 `200`：
  ```
  {
    current:  [{ bucket, created, closed, breached }, ...],
    previous: [{ bucket, created, closed, breached }, ...]  // 上一等长周期同期序列
  }
  ```
- bucket 为日期/小时字符串（如 `2026-10-22` / `2026-10-22 10`）
- breached 计数来自 sla_events.event_type = 'sla_breached'

### GET /api/stats/status-distribution —— 状态分布
- 成功 `200`：
  ```
  {
    list: [{ status, count, ratio }],  // 固定输出 10 状态，count 0 也返回
    overdueOpen: number                // 超时未完结数（overall is_breached 且工单非终态）
  }
  ```
- ratio = count / total（4 位小数）

### GET /api/stats/export —— 报表导出（仅超管）
- Query：`module=overview|workload|sla|trend|status` + period + 统计接口通用参数
- 成功 `200`：CSV 文件流（带 UTF-8 BOM）；部长/员工 403

---

## 8. 附件与健康检查

| 接口 | 说明 |
|---|---|
| POST /api/upload | multipart 字段 `file`；上限读 `system_params.upload_max_mb`（每请求实时读取，修改后即时生效）；扩展名白名单 `.pdf/.doc/.docx/.xls/.xlsx/.ppt/.pptx/.png/.jpg/.jpeg/.gif/.txt/.zip`；返回 `{ name, url }` |
| GET /api/health | 无需登录；`{ status:'ok', db:'up' }`（db=down 时返回 503 `{ status:'down', db:'down' }`） |

---

## 9. 错误码表

| HTTP | code | 场景 | message 示例 |
|---|---|---|---|
| 400 | 1001 | 参数/表单校验失败 | `字段 xxx 为必填项` / `优先级不正确` |
| 401 | 1002 | 未登录 / token 失效 / 账号被禁用锁定 | `未登录` / `账号已禁用或锁定` |
| 403 | 1003 | 无权限执行该操作（角色动作权限或菜单权限不足） | `无权限执行该操作`（统一文案） |
| 404 | 1004 | 资源不存在或数据范围不可见 | `工单不存在` |
| 409 | 1005 | 当前状态不允许该操作 / 版本冲突 / 唯一约束冲突 | `当前状态不允许该操作` / `版本冲突，请刷新后重试` / `同类型下 code 已存在` |
| 413 | 1006 | 附件超限 | `附件大小超出限制` |
| 500 | 1500 | 服务器内部错误 | `服务器内部错误` |

---

## 10. 前端落地对应（文档 §七 契约）

1. **菜单/按钮显隐数据源** = `GET /api/users/me` 返回的 user.role + `GET /api/role-permissions`（前端缓存，仅做显隐，不做权限控制）
2. **报销二级审批按钮 / 财务待办列**：仅 `role === '超级管理员'` 渲染（部长看不到财务待办）
3. **按钮禁用态** = 前端按当前 status 预过滤可执行动作；接口仍可能被拒 → 按信封 message 提示
4. **日志时间线**：渲染 `Log.user` 字段内联的 `（代财务部角色）` 徽标，不自行判断 metadata
5. **SLA 倒计时 / 超时徽标**：
   - 数据来源 = 列表接口附带的 `overallSla` + 详情页 `GET /api/tickets/:id/sla-records`
   - 前端**只渲染不算时**；elapsedDuration 取后端实时计算值
   - `slaExempt = true` 时显示「已豁免」徽标
6. **数据看板三级可见性**：
   - 超管 = 全局看板 + 跨部门对比 + 所有导出按钮
   - 部长 = 部门看板（隐藏全局统计、跨部门对比、导出）
   - 员工 = 个人看板（隐藏工作量排行、部门统计、趋势对比、导出）
   - 无权限模块 / 图表 / 按钮**直接隐藏**，不留空白占位

## 11. 与实现的对应关系

| 路由前缀 | 实现文件 | 备注 |
|---|---|---|
| /api/login /api/users/me | src/routes/auth.js | |
| /api/tickets + /api/sla-records | src/routes/tickets.js | 最大件，含 20 动作统一网关、审批引擎、SLA 联动 |
| /api/users | src/routes/users.js | 仅超管，全部写 audit_logs |
| /api/dictionaries /approval-flows /sla-rules /work-calendars /form-configs /role-permissions /notification-templates /system-params | src/routes/config.js | |
| /api/login-logs /api/audit-logs | src/routes/logs.js | 仅超管 |
| /api/notifications | src/routes/notifications.js | |
| /api/stats + /api/stats/sla/details + /api/stats/export | src/routes/stats.js | 7 接口全部后端聚合 |
| /api/upload | src/routes/upload.js | 上限读 system_params.upload_max_mb |
| /api/health | src/server.js | 内联 handler |

服务层：

| 模块 | 文件 | 说明 |
|---|---|---|
| SLA 引擎 | src/services/sla.js | 计时 / 暂停 / 恢复 / 完结 / 取消，工作日历驱动 |
| 工作日历 | src/services/calendar.js | 逐日累计，特殊日 holiday / extra_workday |
| 通知 | src/services/notify.js | 模板渲染 + business_event_id 幂等 |
| 审计 | src/services/audit.js | writeAudit 统一写 audit_logs |
| SLA 扫描器 | src/services/slaScheduler.js | 周期性扫 running 记录，阈值预警 + 超时置 breached |

其他：

| 项目 | 文件 | 说明 |
|---|---|---|
| 常量 + 权限矩阵 | src/constants.js | ROLES / STATUS / ACTIONS / 20 动作状态机白名单 / 角色动作权限矩阵 / scopeSql 数据范围 |
| 数据库建表 + 种子 | sql/init.sql | 9 枚举 + 19 表 + 4 账号 + 权限矩阵 + 工单 6 张演示单 |
| 历史工单 SLA 回填 | scripts/backfillSla.js | npm run backfill-sla |
| 数据库连接 | src/db.js | Neon pg Pool，时区统一 Asia/Shanghai |
