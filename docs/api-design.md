# 接口设计（依据《完整业务权限规则文档》《数据分析权限独立设计文档》）

> 配套库表设计见 `database-design.md`。REST 风格，统一前缀 `/api`。
> 核心原则（文档强制）：前端只做显隐，**所有权限、动作、数据范围由后端逐请求动态校验**。

## 0. 通用约定

| 项 | 约定 |
|---|---|
| 认证 | JWT Bearer；每个受保护接口回查 users.status（禁用/锁定立即 401） |
| 响应信封 | 成功 `{ code:0, message:'ok', data:... }`；失败 `{ code:<业务码>, message:'中文提示' }` |
| 无权限提示 | 统一 `无权限执行该操作`（与文档 §七-4 一致） |
| 数据范围越权 | 工单级不可见一律 **404**（不暴露存在性） |
| 状态不支持动作 | **409** `当前状态不允许该操作` |
| 时间格式 | `YYYY-MM-DD HH:mm`，Asia/Shanghai |
| 分页排序 | 前端做；列表接口返回权限范围内全量 |
| 幂等 | 写操作接受 `business_event_id` 请求头/字段，重复请求返回首次结果 |

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
| cancel | ✔ | ✔(本人) | ✔(本人) | 非终态；账号工单 L2 节点超管可取消 |
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

## 1. 认证

### POST /api/login
- 请求：`{ username, password, remember }`；remember=true → token 7 天，否则 1 天
- 成功 `200`：`data: { token, user:{ id,username,name,role,dept,email,status } }`
- 失败：`401` 账号或密码错误；`403` 账号已禁用/锁定
- 行为：写 login_logs（成功与失败都写）；连续失败达 `system_params.login_max_retry` 自动锁定

### GET /api/users/me
- 成功 `200`：当前用户对象（刷新恢复登录态）

## 2. 工单

### GET /api/tickets
- Query（均可选，AND 组合）：`keyword`(title/id 模糊) `type` `status` `priority` `dept` `dateFrom/dateTo` `handlerId` `archived`(默认 false)
- 成功 `200`：`data: Ticket[]`，按 created_at 倒序；范围按 §0.1 过滤

### GET /api/tickets/:id
- 成功 `200`：`data: Ticket`（含当前轮 approval_records 摘要）
- 失败：`404` 不存在或无权

### POST /api/tickets
- 请求：`{ type, title, priority?, faultCategory?, description?, attachments?, extra?, submit: true|false }`
- `submit=false` 存草稿（status=draft）；`true` 直接走 submit 动作 → pending_approval，生成首轮 approval_records
- extra 按 form_field_configs 校验（必填/类型）
- 成功 `201`：`data: Ticket`

### PUT /api/tickets/:id
- 仅 **draft** 且申请人本人；全量替换可编辑字段
- 成功 `200`：`data: Ticket`

### POST /api/tickets/:id/actions —— 统一动作网关
- 请求：`{ action, ...payload }`，payload 按动作：

| action | payload | 前置状态 | 效果 |
|---|---|---|---|
| submit | — | draft | →pending_approval，round+1，建新轮审批记录 |
| approve | `{ comment? }` | pending_approval | 推进节点；末节点→下一状态（见流转表） |
| reject_approval | `{ comment }` 必填 | pending_approval | →draft |
| assign | `{ handlerId }` | pending_assignment | →pending_acceptance |
| reassign | `{ handlerId }` | pending_acceptance | 换处理人 |
| accept | — | pending_acceptance | →pending_processing，handler=操作人 |
| transfer | `{ handlerId }` | pending_processing/processing | →pending_acceptance |
| start | — | pending_processing | →processing |
| resolve | `{ result }` 必填 | processing | 故障→pending_confirmation；账号→closed |
| confirm | — | pending_confirmation | →closed |
| supplement | `{ description?, attachments?, extra? }` | 非终态 | 追加材料，状态不变 |
| suspend | `{ reason }` 必填 | 活跃态 | →suspended，metadata 记原状态 |
| resume | — | suspended | →原状态 |
| cancel | `{ reason? }` | 非终态 | →cancelled |
| reopen | `{ reason }` 必填 | closed | 校验时间窗 →pending_processing |
| escalate | `{ reason? }` | 活跃态 | escalated_level+1，发通知 |
| change_priority | `{ priority }` | 活跃态 | 更新优先级，日志记前后值 |
| sla_exempt | `{ reason }` 必填 | 活跃态 | sla_exempt=true |
| mark_paid | `{ voucherNo, amount, remark? }` | pending_processing/processing（仅报销单） | 写 payment_records →closed |

- 校验顺序：登录 → 角色动作权限（§0.2）→ 数据范围（404）→ 状态机白名单（409）→ payload 校验（400）
- 行为：状态 UPDATE + approval_records + ticket_logs + payment_records **同事务**；通知异步；`version` 乐观锁
- 成功 `200`：`data: Ticket`（最新完整对象）

### GET /api/tickets/:id/logs
- 成功 `200`：`data: Log[]`（时间线；代执行记录带 `metadata.proxy`，前端展示「超级管理员（代财务部角色）」）

### GET /api/tickets/export
- 角色：超管；Query 同列表；成功 `200` CSV 文件流

### GET /api/tickets/:id/sla-records —— 工单 SLA 明细
- 成功 `200`：`data: [{ id, metricType, slaStatus, targetDuration, elapsedDuration, deadlineAt, isBreached, breachedDuration, ruleVersion }]`（工单详情 SLA 页签/列表倒计时数据源，前端不自行计算）

### GET /api/sla-records —— SLA 计时监控列表
- 角色：超管（全部）/ 部长（本部门）；员工 403
- Query：`slaStatus`（running/breached/paused）`metricType` `ticketType`
- 成功 `200`：`data: [{ id, ticketId, ticketTitle, metricType, slaStatus, deadlineAt, isBreached, handlerName }]`

### GET /api/tickets/todo —— 我的待办聚合
- 员工：`current_handler_id=me AND status IN ('pending_acceptance','pending_processing','processing')` + 本人申请待确认单
- 部长：上述 + 本部门 L1 pending 审批 + 本部门待分配故障单
- 超管：上述 + L2 pending 审批 + **内置财务部队列**（`assignee_role='builtin_finance' AND status='pending'`）
- 成功 `200`：`data: { handleList:[], approveList:[], financeList?[] }`（financeList 仅超管返回）

## 3. 用户管理（仅超管）

| 接口 | 说明 |
|---|---|
| GET /api/users | 全量列表（不含密码哈希） |
| POST /api/users | 创建；username 唯一 409；初始密码缺省 `123456` |
| PUT /api/users/:id | 改 name/role/dept/email（username 不可改） |
| PATCH /api/users/:id/status | `{ status:'启用'|'禁用'|'锁定' }`；禁用/锁定即时失效 |
| PATCH /api/users/:id/password | 重置为 `123456` |
| DELETE /api/users/:id | 名下有工单 → 409 提示改用禁用 |

全部写 audit_logs（before/after）。

## 4. 系统配置（仅超管；查询类接口除注明外全员可用）

| 接口 | 说明 |
|---|---|
| GET /api/dictionaries?dict_type= | 全员（表单下拉用）；返回 active 项 |
| POST /api/dictionaries | 新增字典项 `{ dictType, code, label, sort }` |
| PUT /api/dictionaries/:id | 改 label/sort/active（code 不可改） |
| GET /api/approval-flows?ticket_type= | 审批节点定义列表 |
| PUT /api/approval-flows/:id | 改 node_name/skip_rule/active；**seq 与 strategy 不可在线改**（改策略=改流程语义，需发版） |
| GET /api/sla-rules?ticket_type= | SLA 规则列表（含历史版本，含关联日历） |
| POST /api/sla-rules | 新增规则**版本** `{ ticketType, metricType, priority?, nodeSeq?, targetValue, targetUnit, calendarId?, warningThresholds?, repeatRemindInterval? }`；历史版本不改 |
| PATCH /api/sla-rules/:id | active 启停（版本内容不可改） |
| GET /api/work-calendars / PUT /api/work-calendars/:id | 工作日历（含 special_days 维护） |
| GET /api/form-configs?ticket_type= | 全员（渲染提交表单） |
| POST /api/form-configs / PUT /api/form-configs/:id | 自定义字段增改（不可物理删，active=false 下线） |
| GET /api/role-permissions / PUT /api/role-permissions | 角色-权限码矩阵查询与整组更新 |
| GET /api/notification-templates / PUT /api/notification-templates/:id | 站内通知模板 |
| GET /api/system-params / PUT /api/system-params/:key | 系统参数（重开窗口/附件上限/登录策略等） |

所有配置变更写 audit_logs（actor + before/after）。

## 5. 日志查询（仅超管）

| 接口 | Query | 说明 |
|---|---|---|
| GET /api/login-logs | `username/success/dateFrom/dateTo` | 登录留痕 |
| GET /api/audit-logs | `actorId/targetType/targetId/dateFrom/dateTo` | 配置与权限变更审计 |

## 6. 通知

| 接口 | 说明 |
|---|---|
| GET /api/notifications | 我的站内通知（read_at 升序+未读优先） |
| PATCH /api/notifications/:id/read | 标记已读 |
| PATCH /api/notifications/read-all | 全部已读 |

触发点（异步，不进状态事务）：分配/转派/重指派→新处理人；审批通过/驳回→申请人；提交结果→申请人；escalate→部长+超管；SLA 预警/超时→处理人+部长。

## 7. 统计（数据分析模块）

> 统计口径见 database-design.md §9。通用约定：
> - 全部接口支持 `period=day|week|month|quarter|year`（默认 month）+ `date`（周期锚点，默认当前）
> - **数据范围后端强制**：部长自动追加 `dept=本部门`，员工自动追加 `申请人/处理人=本人`；页面筛选（dept/type/priority）只能在范围内收窄——角色 > 筛选，改参数无法越权
> - 三角色均可调用（员工返回个人范围数据）；导出仅超管

### GET /api/stats/overview —— 数据聚合规模
- `data: { total, created, closed, unclosed, cancelled, rejected }`（rejected=周期内 reject_approval 动作数）

### GET /api/stats/workload —— 人员工作量
- `data: { list: [{ userId, name, accepted, processed, closed, rejected, cancelled }], avgPerPerson }`
- 超管：全员+跨部门对比；部长：本部门人员+排行；员工：仅本人一行（无排行）

### GET /api/stats/sla —— 超时率统计
- `data: { overallRate, responseRate, approvalRate, processingRate, breachedCount, avgBreachedDuration }`（按 sla_records.metric_type 分组计算）

### GET /api/stats/sla/details —— 超时工单明细
- `data: [{ ticketId, title, metricType, breachedDuration, handlerName, dept }]`；员工仅本人相关行

### GET /api/stats/trend —— 工单趋势（含同期对比）
- `data: { current: [{ bucket, created, closed, breached }], previous: [...] }`（bucket 按 period 分桶；previous=上一等长周期同期序列）

### GET /api/stats/status-distribution —— 状态分布
- `data: { list: [{ status, count, ratio }], overdueOpen }`（overdueOpen=超时未完结数）

### GET /api/stats/export —— 报表导出（仅超管）
- Query：`module=overview|workload|sla|trend|status` + period + 筛选
- 成功 `200` CSV 文件流；部长/员工 `403` 无权限执行该操作

## 8. 附件与健康检查

| 接口 | 说明 |
|---|---|
| POST /api/upload | multipart 字段 `file`；上限 `system_params.upload_max_mb`；返回 `{ name, url }`；`413` 超限 / `400` 类型不允许 |
| GET /api/health | 无需登录；`{ status:'ok', db:'up' }` |

## 9. 错误码表

| HTTP | code | 场景 |
|---|---|---|
| 400 | 1001 | 参数/表单校验失败（message 指明字段） |
| 401 | 1002 | 未登录 / token 失效 / 账号被禁用锁定 |
| 403 | 1003 | 无权限执行该操作（角色动作权限或菜单权限不足） |
| 404 | 1004 | 资源不存在或数据范围不可见 |
| 409 | 1005 | 当前状态不允许该操作 / 版本冲突（并发）/ 唯一约束冲突 |
| 413 | 1006 | 附件超限 |
| 500 | 1500 | 服务器内部错误 |

## 10. 前端落地对应（文档 §七 契约）

1. 菜单/按钮显隐数据 = `GET /api/users/me` 返回的 user.role + `GET /api/role-permissions`（前端缓存，仅做显隐）
2. 报销二级审批按钮、财务待办列：仅 `role==='超级管理员'` 渲染
3. 按钮禁用态 = 前端按当前 status 预过滤动作；接口仍可能被拒 → 按信封 message 提示
4. 日志时间线渲染 `metadata.proxy` 为「（代财务部角色）」徽标
5. SLA 倒计时/超时徽标：数据来自 `GET /api/tickets/:id/sla-records` 与列表接口附带的 overall 记录，前端只渲染不算时；`slaExempt=true` 的工单显示「已豁免」徽标
6. 数据看板三级：超管=全局看板+导出按钮；部长=部门看板（隐藏全局统计、跨部门对比、导出）；员工=个人看板（隐藏工作量排行、部门统计、趋势对比、导出）；无权限模块/图表/按钮直接隐藏，不留空白展示
