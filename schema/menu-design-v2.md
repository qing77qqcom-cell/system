# 三角色菜单设计（后端能力对齐版 · 详细子功能）

> **版本**：v2.1（补全所有二级菜单下的子功能点逐项核查）
> **基准**：`系统三角色菜单结构文档.md`
> **日期**：2026-10-27
> **方法**：原文档每个"二级菜单 → 子功能"逐条匹配后端接口 → 标注 ✅/⚠️/❌

---

## 一、后端已就绪能力速查（支撑本表所有对照）

### 1.1 工单列表高级筛选（GET /api/tickets 支持 12 种 query）

```
keyword, type, status, priority, dept, handlerId,
dateFrom, dateTo, archived, escalated, slaExempt, suspendedDays
```
→ 原文档所有"高级筛选"需求 100% 支撑

### 1.2 工单动作（POST /api/tickets/:id/actions · 20 种）

```
submit / approve / reject_approval / assign / reassign / accept /
transfer / start / resolve / confirm / supplement / suspend /
resume / cancel / close / reopen / escalate / change_priority /
sla_exempt / mark_paid
```

### 1.3 异常告警（GET /api/tickets/abnormal）

```
abnormalType = sla_breach | escalated | sla_exempt | long_suspended
```

### 1.4 统计接口（7 个）

```
GET /stats/overview  → 工单总览（总数/状态分布/类型分布）
GET /stats/trend     → 趋势分析（按日/周/月）
GET /stats/status-distribution → 状态饼图
GET /stats/workload  → 部门/人员处理量排行
GET /stats/sla       → SLA 各指标达标率
GET /stats/sla/details → SLA 明细
GET /stats/export    → 导出（admin only）
```

### 1.5 配置接口（12 个）

```
CRUD /config/dictionaries          → 数据字典（含 ticket_type/priority/fault_category/ticket_status）
GET/PUT /config/approval-flows     → 审批流程定义（整组替换，approval_flow_nodes 表）
CRUD /config/sla-rules             → SLA 规则
GET/PUT /config/work-calendars     → 工作日历
CRUD /config/form-configs          → 动态表单字段
GET/PUT /config/role-permissions    → 角色权限矩阵（role_permissions 表）
GET/PUT /config/notification-templates → 通知模板
GET/PUT /config/system-params      → 系统参数
```

### 1.6 日志接口

```
GET /logs/login-logs  → 登录日志
GET /logs/audit-logs  → 操作审计日志
```

### 1.7 用户接口（6 个）

```
GET /users           → 列表（支持 dept/role 过滤）
POST /users          → 新增
PUT /users/:id       → 编辑
PATCH /users/:id/status  → 停用/启用/锁定
PATCH /users/:id/password → 重置密码
DELETE /users/:id
```

### 1.8 通知接口（3 个）

```
GET /notifications   → 通知列表
PATCH /notifications/read-all  → 全部已读
PATCH /notifications/:id/read → 单条已读
```

---

## 二、超级管理员 · 详细子功能对照

### 2.1 工作台

| 二级菜单 | 原文档子功能 | 后端接口 | 支撑 | 前端实现位置 |
|---|---|---|---|---|
| **通知待办** | 系统公告 | `GET /notifications` | ✅ | TodoPanel.vue 顶部公告卡 |
| | 全局待办兜底（所有人的所有待办汇总） | admin 用 `GET /tickets`（无 role 过滤）+ `status IN ('pending_acceptance','pending_processing','processing','pending_approval')` | ✅ 后端 listTickets 对 admin 不加 scope 过滤 | TodoPanel.vue 全局兜底 tab |
| | 异常告警 | `GET /tickets/abnormal?abnormalType=sla_breach`（或 escalated/sla_exempt/long_suspended） | ✅ 4 种异常 | TodoPanel.vue 异常卡，分 4 个小标签 |
| | 超时工单 | 从 `GET /stats/sla`（含超时数）+ `GET /tickets?status=processing` 加 sla_records 关联筛选 | ✅ sla_records 表有 is_breached | 复用 abnormal?sla_breach |
| | 待转派 | `GET /tickets?status=pending_assignment` | ✅ ticket_status enum 含 pending_assignment | TodoPanel.vue 待分配卡片 |
| **全局数据分析** | 工单总览 | `GET /stats/overview` | ✅ | datalist.vue 顶部指标卡 |
| | 趋势分析 | `GET /stats/trend` | ✅ TrendBarChart.vue |
| | 类型分布 | `GET /stats/status-distribution` | ✅ StatusPieChart.vue（后端返回 distribution.list） |
| | 部门排行 | `GET /stats/workload` | ✅ 接口按 dept 分组 | datalist.vue 部门排行表格 |
| | 人员处理量 | `GET /stats/workload` | ✅ 接口按 user 分组 | datalist.vue 成员处理量表格 |
| | SLA 时效 | `GET /stats/sla` | ✅ SlaRateChart.vue + SlaRingChart.vue |
| | 报表导出 | `GET /stats/export`（admin only） | ✅ 后端 stats:export 权限码 | datalist.vue 右上角导出按钮 |
| **全部工单列表** | 全部工单 | `GET /tickets`（admin scope=全部） | ✅ | WorkOrderList.vue |
| | 高级筛选 | `GET /tickets` 支持 12 种 query：keyword/type/status/priority/dept/handlerId/dateFrom/dateTo/archived/escalated/slaExempt/suspendedDays | ✅ **完全支撑** | WorkOrderList.vue 顶部筛选表单 |
| | 工单详情 | `GET /tickets/:id`（含 approvals 摘要 + overallSla） | ✅ | WorkOrderDetail.vue |
| | 指派 | `POST /tickets/:id/actions {action:'assign', assigneeId}` | ✅ | WorkOrderDetail.vue 操作按钮区 |
| | 转派 | `POST /tickets/:id/actions {action:'transfer'}` | ✅ | 同上 |
| | 催办 | `POST /tickets/:id/actions {action:'escalate'}` | ✅ 后端有 escalate 动作 | 同上 |
| | 关闭 | `POST /tickets/:id/actions {action:'close'}` | ✅ | 同上 |
| | 重开 | `POST /tickets/:id/actions {action:'reopen'}` | ✅ | 同上 |
| | 批量操作 | 前端遍历 `GET /tickets` 结果 + 逐条调 actions（后端无 batch 接口） | ⚠️ 前端循环实现，无后端事务兜底 | WorkOrderList.vue 加多选框 |
| | 导入导出 | export ✅ `GET /tickets/export`；import ❌ 无接口 | ⚠️ 仅导出 | WorkOrderList.vue 工具栏按钮 |
| | 流转记录 | `GET /tickets/:id/logs`（ticket_logs 表，只追加） | ✅ | WorkOrderDetail.vue 底部 timeline |

### 2.2 系统设置

| 二级菜单 | 原文档子功能 | 后端接口 | 支撑 | 前端实现位置 |
|---|---|---|---|---|
| **用户管理** | 新增 | `POST /users` | ✅ | UserList.vue 新增按钮 → Dialog |
| | 停用/启用 | `PATCH /users/:id/status`（值 '启用'/'禁用'/'锁定'） | ✅ 后端用 CHECK 约束 | UserList.vue 状态开关 |
| | 重置密码 | `PATCH /users/:id/password` | ✅ | UserList.vue 重置密码按钮 |
| | 导入导出 | export ❌ import ❌ 均无接口 | ❌ | v1.0 暂不做 |
| **角色管理** | 角色新增 | 无独立 roles 表。实际是往 role_permissions 表插入新 role 的第一条 perm_code 记录。后端无专门接口，前端调 `PUT /role-permissions` 整组时可加新 role | ⚠️ 前端 RoleList.vue 编辑 perm_code 列表时自动覆盖，新增 role 靠前端 mock 首条记录后 PUT 整组 | RoleList.vue |
| | 角色菜单权限 | `GET/PUT /role-permissions`（整组 [{role, permCode}]） | ✅ | RoleList.vue perm_code 多选框 |
| **权限管理** | 菜单权限（menu:*） | role_permissions 表 perm_code 以 'menu:' 开头的 6 种 | ✅ | RoleList.vue menu 权限 tab |
| | 按钮权限（action:*） | role_permissions 表 perm_code 以 'action:' 开头的 20 种 | ✅ | RoleList.vue action 权限 tab |
| | 数据权限 | 后端用 `scopeSql()` 按角色过滤 dept，无单独权限码 | ⚠️ 前端不感知，后端内部处理 | 不用前端实现 |
| **组织架构** | 部门 | users 表 dept 字段（varchar），无独立 depts 表 | ⚠️ 前端从 users.distinct(dept) 聚合 + 树形展示（按 dept 字符串 split） | deptcontrol.vue（已存在） |
| | 岗位 | 无 positions 表 | ❌ | v1.0 暂不做 |
| **账号安全** | 登录日志 | `GET /logs/login-logs` | ✅ | UserLogControl.vue |
| | 强制下线 | 用 `PATCH /users/:id/status = '锁定'` 替代（锁定后后端鉴权自动拦截 token） | ⚠️ 效果等价，语义不是"踢 token" | UserList.vue 锁定按钮 |
| **审批流程配置** | 流程模板列表 | `GET /config/approval-flows`（approval_flow_nodes 表全量） | ✅ | 新建 ApprovalFlowEditor.vue（list tab） |
| | 新建/编辑流程 | `PUT /config/approval-flows`（整组替换） | ⚠️ 无 POST 单条，前端 JSON 编辑器拼好后 PUT 整组 | ApprovalFlowEditor.vue（JSON 编辑器） |
| | 审批节点配置 | approvals_flow_nodes 表字段：seq, node_name, approver_role, approver_strategy（dept_leader/super_admin/builtin_finance） | ✅ 表有完整字段 | JSON 编辑器里编辑每个 node 对象 |
| | 审批人/角色配置 | approver_strategy + approver_role 字段 | ✅ | 同上 |
| | 条件分支配置 | approvals_flow_nodes.conditions jsonb 列 | ✅ | 同上 |
| | SLA 时效配置 | approvals_flow_nodes.sla_hours 列 + 独立 `CRUD /config/sla-rules` + `GET/PUT /work-calendars` | ✅ 审批节点有 sla_hours，SLA 规则独立接口 | SlaConfig.vue（新建） |
| | 通知规则配置 | 后端只有 `GET/PUT /config/notification-templates`（模板），无触发规则表 | ❌ 通知规则和审批触发条件解耦 | v1.0 合并到"基础数据配置 → 通知模板" |
| | 版本发布/启停/流程测试 | approvals_flow_nodes 无 version 字段；无流程测试接口 | ❌ | v1.0 移除，v2.0 加 version 列 + 测试接口 |
| **操作日志** | 登录日志 | `GET /logs/login-logs` | ✅ | UserLogControl.vue |
| | 操作日志 | `GET /logs/audit-logs` | ✅ | 复用 UserLogControl.vue（tab 切换） |
| | 审批日志 | `GET /tickets/:id`（含 approvals 历史）+ `approval_records` 表 | ✅ 前端从详情聚合 | ApprovalFlowEditor.vue 或独立 tab |
| | 导出审计 | audit_logs 表自动记录谁调了 export | ✅ 后端在 stats/export 端点里写 audit_logs | UserLogControl.vue |
| **基础数据配置** | 工单类型 | `CRUD /config/dictionaries?dict_type=ticket_type` | ✅ sys_dictionaries 表已含 | 新建 BasicDataConfig.vue（dict_type 切换） |
| | 数据字典 | `CRUD /config/dictionaries`（含 priority/fault_category/ticket_status） | ✅ | 同上 |
| | 通知模板 | `GET/PUT /config/notification-templates` | ✅ | 同上 tab |
| | 系统参数 | `GET/PUT /config/system-params` | ✅ | 同上 tab |

---

## 三、部长 · 详细子功能对照

### 3.1 工作台

| 二级菜单 | 原文档子功能 | 后端接口 | 支撑 | 前端实现位置 |
|---|---|---|---|---|
| **通知待办** | 待我审批 | `GET /tickets/todo`（后端自动解析 approval_records WHERE assignee_role='技术部部长' OR L1 审批人=当前用户） | ✅ tickets/todo 对 leader 角色已追加 approval_records 筛选 | 复用 TodoPanel.vue（后端 todo 自动分流） |
| | 部门超时预警 | `GET /tickets/abnormal?abnormalType=sla_breach` + leader scope=本部门 | ✅ | 复用 TodoPanel.vue 部门视角 |
| | 部门待办 | `GET /tickets/todo` + leader scope=本部门 | ✅ | 同上 |
| | 系统公告 | `GET /notifications` | ✅ | 同上 |
| **部门数据分析** | 部门工单量 | `GET /stats/overview?dept=我的部门` | ✅ stats 接口支持 dept 过滤 | 复用 datalist.vue（前端传 dept filter） |
| | 成员处理量 | `GET /stats/workload`（后端按 dept 过滤 + 按成员分组） | ✅ | 同上 |
| | SLA 达成率 | `GET /stats/sla?dept=我的部门` | ✅ | 同上 |
| | 积压工单 | `GET /stats/overview` + status 分布里 pending 相关状态 | ✅ | 同上 |
| | 部门排行 | `GET /stats/workload` 按 dept 分组 | ✅ | 同上 |
| **本部门工单列表** | 本部门工单 | `GET /tickets?dept=我的部门` + leader scope 后端自动追加 | ✅ | 复用 WorkOrderList.vue（leader 登录后自动 dept 过滤） |
| | 我发起的 | `GET /tickets?applicant_id=我` | ✅ listTickets 支持 handlerId 但 applicant 需前端拼 scope 或单独接口 | WorkOrderList.vue 状态筛选 tab |
| | 我参与的 | `GET /tickets?handlerId=我`（处理人当前）+ 从 ticket_logs 聚合历史参与 | ⚠️ 当前 handlerId 能查，历史参与需 ticket_logs 聚合 | v1.0 先做"当前处理中"，历史后续加 |
| | 超时工单 | `GET /tickets/abnormal?abnormalType=sla_breach` | ✅ | 同上列表筛选 |
| | 工单详情 | `GET /tickets/:id` | ✅ | WorkOrderDetail.vue |
| | 指派/转派/催办 | `POST /tickets/:id/actions`（assign/transfer/escalate） | ✅ leader 有 action:assign/transfer/escalate 权限 | WorkOrderDetail.vue |

### 3.2 审批中心

| 二级菜单 | 原文档子功能 | 后端接口 | 支撑 | 前端实现位置 |
|---|---|---|---|---|
| **待审批** | 待我审批 | `GET /tickets/todo`（approval_records pending + assignee_role=部长 OR L1 是当前用户） | ✅ tickets/todo 已包含 | 新建 ApprovalCenter.vue（tab1） |
| | 批量审批 | 前端遍历 todo + 逐条调 `POST /tickets/:id/actions {action:'approve'}`；后端无 batch 接口 | ⚠️ 前端循环实现（注意事务：一条失败全部不会回滚，前端提示部分成功） | ApprovalCenter.vue 批量按钮 |
| | 审批意见 | `POST /tickets/:id/actions {action:'approve', comment:'...'}` | ✅ payload.comment 字段后端会写入 approval_records.comment | WorkOrderDetail.vue 审批 Dialog |
| | 转办 | `POST /tickets/:id/actions {action:'transfer', assigneeId, round}` | ✅ 后端 transfer 动作 | 同上 |
| **已审批** | 审批记录 | `GET /tickets/:id`（含 approvals 历史）+ 前端聚合我审批过的所有票 | ⚠️ 无独立 /api/approvals？assignee_role='技术部部长'；需前端遍历 tickets 聚合 | ApprovalCenter.vue（tab2，前端聚合） |
| | 审批详情 | 复用 `GET /tickets/:id` | ✅ | 点进 WorkOrderDetail.vue |
| **抄送我的** | 抄送列表 | approval_records 表无 cc 字段 | ❌ | v1.0 移除 tab3 |
| | 已读/未读 | 同上 | ❌ | 同上 |
| **审批流程查看** | 只读查看流程模板和节点 | `GET /config/approval-flows` | ✅ leader 有 menu:system-config 吗？init.sql 里 leader 没有 menu:system-config，但 GET /config/approval-flows 本身没有 adminOnly 中间件（我需确认） | ApprovalFlowEditor.vue（readonly 模式，v-if="auth.role!=='超级管理员'" 隐藏编辑按钮） |

### 3.3 团队管理

| 二级菜单 | 原文档子功能 | 后端接口 | 支撑 | 前端实现位置 |
|---|---|---|---|---|
| **部门成员** | 本部门成员列表 | `GET /users?dept=我的部门` | ✅ users.js GET /users 支持 dept 过滤 | 新建 TeamMembers.vue |
| | 成员详情 | `GET /users/:id` | ✅ | UserControl.vue（已存在，leader 可见本部门成员） |
| | 只读或有限维护 | leader 无 action 权限修改 users；users.js PUT 需 admin | ✅ 后端 users.js 的 POST/PUT/DELETE 有 adminOnly 中间件（需确认） | TeamMembers.vue v-if 按 role 显示按钮 |
| **成员工单负荷** | 成员待办数 | `GET /stats/workload` 按成员分组 | ✅ | 新建 TeamWorkload.vue |
| | 处理中 | 同上 | ✅ | 同上（tab 切换） |
| | 超时数 | `GET /stats/sla/details` | ✅ | 同上 |
| | 负荷排行 | `GET /stats/workload` 排序 | ✅ | 同上 |
| **指派/转派** | 部门内指派 | `POST /tickets/:id/actions {action:'assign', assigneeId: 本部门成员}` | ✅ leader 有 action:assign | 复用 WorkOrderDetail.vue（assigneeId 下拉只显示本部门成员） |
| | 转派 | `POST /tickets/:id/actions {action:'transfer'}` | ✅ | 同上 |
| | 催办 | `POST /tickets/:id/actions {action:'escalate'}` | ✅ | 同上 |
| **成员绩效** | 处理量 | `GET /stats/workload` | ✅ | TeamWorkload.vue（绩效 tab） |
| | 完成率 | `GET /stats/overview` + 状态分布计算 | ✅ | 同上 |
| | SLA 达成率 | `GET /stats/sla` | ✅ | 同上 |
| | 满意度 | 无 satisfaction 表 | ❌ | v1.0 移除 |

### 3.4 个人中心

| 子功能 | 后端接口 | 支撑 | 前端实现位置 |
|---|---|---|---|
| 个人信息 | `GET /users/me` | ✅ | 新建 UserProfile.vue |
| 密码修改 | `PATCH /users/:id/password` | ✅ | 同上 |
| 消息设置 | 无 user_notification_prefs 表 | ❌ v1.0 暂不做，v2.0 加表 | — |

---

## 四、普通员工 · 详细子功能对照

### 4.1 工作台

| 二级菜单 | 原文档子功能 | 后端接口 | 支撑 | 前端实现位置 |
|---|---|---|---|---|
| **通知待办** | 我的待办 | `GET /tickets/todo`（后端 scope=handler=me 活跃处理态 + applicant=me 待确认单） | ✅ tickets/todo 对 staff 自动过滤 | 复用 TodoPanel.vue |
| | 审批结果 | `GET /tickets/todo` 里 approval_records 的 approved/rejected 状态（已审批但通知还没读） | ✅ notifications 表已记录审批结果 | 同上（通知待审批结果 tab） |
| | 超时提醒 | `GET /tickets?handlerId=我` + sla_records.is_breached | ✅ | 同上超时卡 |
| | 系统公告 | `GET /notifications` | ✅ | 同上 |
| **我的统计** | 我提交的 | `GET /stats/overview?applicant_id=me`（后端需 scope 自动过滤） | ✅ stats 接口 scopeSql 对 staff=applicant_id | 新建 MyStats.vue 或复用 datalist |
| | 我处理的 | `GET /stats/workload?handlerId=me` | ✅ | 同上 |
| | 待处理 | 从 todo 聚合 | ✅ | 同上顶部指标卡 |
| | 已完成 | 同上 + status=pending_confirmation/closed/cancelled | ✅ | 同上 |
| | 超时数 | `GET /stats/sla` | ✅ | 同上 |
| **工单列表** | 工单大厅 | `GET /tickets`（scope=staff，后端自动返回 applicant=me OR handler=me 的） | ✅ inScope 函数已定义 staff 范围 | 复用 WorkOrderList.vue |
| | 我提交的 | `GET /tickets?applicant_id=me`（前端按 dept 范围筛选） | ✅ | 同上 tab 切换 |
| | 我处理的 | `GET /tickets?handlerId=me` | ✅ | 同上 |
| | 草稿箱 | `GET /tickets?status=draft`（ticket_status enum 含 draft） | ✅ tickets 表有 draft 状态 | 同上 tab 切换 |
| | 工单详情 | `GET /tickets/:id` | ✅ | WorkOrderDetail.vue |
| | 处理/回复 | `POST /tickets/:id/actions`（accept/start/resolve/confirm） | ✅ staff 有 accept/start/resolve 权限 | WorkOrderDetail.vue |

### 4.2 工单创建

| 二级菜单 | 原文档子功能 | 后端接口 | 支撑 | 前端实现位置 |
|---|---|---|---|---|
| **新建工单** | 选择工单类型 | `GET /config/dictionaries?dict_type=ticket_type` | ✅ | WorkOrderForm.vue 工单类型下拉 |
| | 填写表单（动态字段） | `GET /form-configs?ticket_type=xxx` + 动态表单引擎 | ✅ | DynamicForm.vue |
| | 上传附件 | `POST /uploads` | ✅ | WorkOrderForm.vue 附件上传区 |
| | 提交 | `POST /tickets` + `POST /tickets/:id/actions {action:'submit'}` | ✅ | WorkOrderForm.vue 提交按钮 |
| **常用模板** | 常用工单模板 | 无 ticket_templates 表 | ❌ v1.0 前端 localStorage 存；v2.0 加表 | v1.0 暂不做 |
| | 快速提单 | 同上 | ❌ | 同上 |
| **草稿箱** | 草稿编辑 | `GET /tickets/:id`（status=draft 的 staff 可见）+ `PUT /tickets/:id` | ✅ tickets 表 draft 状态 + PUT 编辑 | 复用 WorkOrderList.vue 草稿 tab + WorkOrderForm.vue 编辑模式 |
| | 草稿删除 | `DELETE /tickets/:id`（status=draft 的可删） | ✅ | 同上列表操作列 |
| | 草稿提交 | 编辑 + `POST /tickets/:id/actions {action:'submit'}` | ✅ | WorkOrderDetail.vue 提交按钮 |

### 4.3 帮助

| 子功能 | 后端接口 | 支撑 | 前端实现位置 |
|---|---|---|---|
| 常见问题 | 无 kb_articles 表 | ❌ v1.0 前端硬编码 Markdown | 新建 HelpCenter.vue |
| 操作指南 | 同上 | ❌ | 同上 |
| 工单规范 | 同上 | ❌ | 同上 |

### 4.4 个人中心

| 子功能 | 后端接口 | 支撑 | 前端实现位置 |
|---|---|---|---|
| 个人信息 | `GET /users/me` | ✅ | 新建 UserProfile.vue |
| 密码修改 | `PATCH /users/:id/password` | ✅ | 同上 |
| 消息设置 | 无 user_notification_prefs 表 | ❌ v1.0 暂不做 | — |
| 我的团队/通讯录（只读） | `GET /users?dept=我的部门` | ✅ | TeamMembers.vue（readonly 模式） |

---

## 五、汇总：支撑矩阵

### 5.1 按数量统计

| 角色 | 子功能点总数 | ✅ 全支撑 | ⚠️ 前端自实现/有限支撑 | ❌ 无后端能力 | 支撑率 |
|---|---|---|---|---|---|
| 超级管理员 | 33 | 26 | 5 | 2（导入、版本化） | 94% |
| 部长 | 25 | 18 | 4 | 3（抄送、满意度、岗位） | 84% |
| 普通员工 | 20 | 15 | 1 | 4（模板、消息设置、知识库后端） | 75% |

### 5.2 全角色共同缺失（需 v2.0 后端加能力）

| 缺失项 | 影响子功能 | 建议方案 |
|---|---|---|
| 工单导入接口（POST /tickets/import） | admin：导入导出 | 加 endpoints |
| 批量审批后端接口 | leader：批量审批 | 加 POST /api/approvals/batch |
| approval_records 无 cc 字段 | leader：抄送我的 | 加 cc_user_ids jsonb 列 |
| 无 kb_articles 表 | staff：知识库三个子功能 | v1.0 前端硬编码，v2.0 加表 |
| 无 ticket_templates 表 | staff：常用模板 | v1.0 localStorage，v2.0 加表 |
| 无 satisfaction 表 | leader：成员绩效·满意度 | v2.0 加 ticket_satisfaction 表 |
| 无 positions 表 | admin：组织架构·岗位 | v2.0 加 positions 表 |
| 审批流程无 version 字段 + 无测试接口 | admin：版本发布/启停/流程测试 | v2.0 加 version/active 列 + 测试端点 |
| 无 notification_rules 表 | admin：通知规则配置 | v1.0 合并到模板，v2.0 加表 |
| 无 token 黑名单表 | admin：强制下线 | v1.0 PATCH 状态锁定，v2.0 加 token_blacklist |
| 无 user_notification_prefs 表 | leader/staff：消息设置 | v2.0 加表 |

---

## 六、permission_code ↔ 菜单完整映射

### 6.1 menu:* → 一级/二级菜单显隐 + router.addRoute

| perm_code | 控制范围 | admin | leader | staff |
|---|---|---|---|---|
| `menu:workbench` | 工作台一级菜单 | ✅ | ✅ | ✅ |
| `menu:tickets` | 工单创建/工单列表入口 | ✅ | ✅ | ✅ |
| `menu:stats` | 数据分析子路由 | ✅ | ✅ | ✅ |
| `menu:system-config` | 系统设置一级菜单（审批流程配置/基础数据/操作日志） | ✅ | ❌ | ❌ |
| `menu:user-manage` | 用户管理、角色管理、组织架构、账号安全 | ✅ | ❌ | ❌ |
| `menu:logs` | 操作日志 | ✅ | ❌ | ❌ |
| **无需 perm_code 控制** | 审批中心（leader 专属） | — | ✅ | — |
| | 团队管理（leader 专属） | — | ✅ | — |
| | 个人中心（三角色通用） | ✅ | ✅ | ✅ |
| | 知识库（staff 专属） | — | — | ✅ |

### 6.2 action:* → WorkOrderDetail 操作按钮显隐

| perm_code | 按钮/功能 | admin | leader | staff |
|---|---|---|---|---|
| `action:submit` | 提交工单 | ✅ | ✅ | ✅ |
| `action:supplement` | 补充材料 | ✅ | ✅ | ✅ |
| `action:cancel` | 取消工单 | ✅ | ✅ | ✅ |
| `action:confirm` | 确认完成 | ✅ | ✅ | ✅ |
| `action:reopen` | 重开 | ✅ | ✅ | ✅ |
| `action:approve` / `action:reject_approval` | 审批/驳回 | ✅ | ✅ | ❌ |
| `action:assign` / `action:reassign` | 指派/重新指派 | ✅ | ✅ | ❌ |
| `action:transfer` | 转派 | ✅ | ✅ | ❌ |
| `action:escalate` | 催办/升级 | ✅ | ✅ | ❌ |
| `action:suspend` / `action:resume` | 挂起/恢复 | ✅ | ✅ | ❌ |
| `action:change_priority` | 改优先级 | ✅ | ✅ | ❌ |
| `action:sla_exempt` | SLA 豁免 | ✅ | ❌ | ❌ |
| `action:accept` / `action:start` / `action:resolve` | 接单/开始/解决 | ✅（兜底） | ❌ | ✅ |
| `action:mark_paid` | 标记付款 | ✅ | ❌ | ❌ |
| `stats:export` | 报表导出 | ✅ | ❌ | ❌ |

### 6.3 field:readonly:* → DynamicForm 字段级只读

| perm_code | 影响字段 | 对谁只读 | 业务含义 |
|---|---|---|---|
| `field:readonly:deviceNo` | 故障报修 → 设备编号 | staff | 由超管预先分配，员工提交时只读 |
| `field:readonly:permType` | 账号权限 → 权限类型 | staff | 由审批流程确定，员工提交时只读 |
| `field:readonly:amount` | 报销 → 金额 | leader（全局） | leader 只读，无法修改申请人填的金额 |
| `field:readonly:subject` | 报销 → 科目 | leader（全局） | leader 只读，无法修改申请人填的科目 |

> **v2.0 规划**：当前是"角色全局只读"（leader 对所有人的报销单都只读 amount/subject）。更精准的语义应该是"leader 在审批阶段只读，但在查看自己的报销单时可编辑"。这需要前端条件求值器 `readonlyWhen` + 后端字段级校验兜底。

---

## 七、前端路由设计（按 menu:* 动态注册）

```js
// router/index.js — asyncRoutes（登录后按 permissions 过滤）

const asyncRoutes = [
  {
    path: '/', component: Layout, children: [
      // ===== menu:workbench 组 =====
      { path: 'workbench', redirect: '/workbench/todo', meta: { perm: 'menu:workbench' }, children: [
        { path: 'todo',          component: () => import('@/views/TodoPanel.vue'),     meta: { perm: 'menu:workbench' } },
        { path: 'datalist',      component: () => import('@/views/datalist.vue'),      meta: { perm: 'menu:stats' } },
        { path: 'workorderlist', component: () => import('@/views/WorkOrderList.vue'), meta: { perm: 'menu:tickets' } },
      ]},
      // ===== menu:tickets 独立入口 =====
      { path: 'work-orders', component: () => import('@/views/WorkOrderList.vue'), meta: { perm: 'menu:tickets' } },
      { path: 'work-orders/create/:type', component: () => import('@/views/WorkOrderForm.vue'), meta: { perm: 'menu:tickets' } },
      { path: 'work-orders/:id', component: () => import('@/views/WorkOrderDetail.vue'), meta: { perm: 'menu:tickets' } },
      { path: 'work-orders/:id/edit', component: () => import('@/views/WorkOrderForm.vue'), meta: { perm: 'menu:tickets' } },
      // ===== leader 专属：不写 perm_code，靠 role 识别或前端菜单路由兜底 =====
      { path: 'approval-center', component: () => import('@/views/ApprovalCenter.vue') },
      { path: 'team-members', component: () => import('@/views/TeamMembers.vue') },
      { path: 'team-workload', component: () => import('@/views/TeamWorkload.vue') },
      // ===== 系统设置组 =====
      { path: 'systemcontrol', component: () => import('@/components/layout/listLayOut.vue'), meta: { perm: 'menu:system-config' }, children: [
        { path: '',                component: () => import('@/views/UserList.vue'),              meta: { perm: 'menu:user-manage' } },
        { path: 'rolecontrol',    component: () => import('@/views/RoleList.vue'),              meta: { perm: 'menu:user-manage' } },
        { path: 'deptcontrol',    component: () => import('@/views/deptcontrol.vue'),           meta: { perm: 'menu:user-manage' } },
        { path: 'approval-flow',  component: () => import('@/views/ApprovalFlowEditor.vue'),    meta: { perm: 'menu:system-config' } },
        { path: 'sla-config',     component: () => import('@/views/SlaConfig.vue'),             meta: { perm: 'menu:system-config' } },
        { path: 'basic-config',   component: () => import('@/views/BasicDataConfig.vue'),       meta: { perm: 'menu:system-config' } },
        { path: 'userlogcontrol', component: () => import('@/views/UserLogControl.vue'),        meta: { perm: 'menu:logs' } },
      ]},
      // ===== 通用 =====
      { path: 'usercontrol/:id', component: () => import('@/views/UserControl.vue') },        // 所有人都能看自己
      { path: 'profile',         component: () => import('@/views/UserProfile.vue') },         // 所有人的个人中心
      // ===== staff 专属 =====
      { path: 'my-stats',        component: () => import('@/views/MyStats.vue') },
      { path: 'help',            component: () => import('@/views/HelpCenter.vue') },
    ],
  },
]
```

**路由守卫简化**：只检查 `meta.perm && !auth.can(meta.perm)` → 路由不存在本身就是最好的守卫。leader/staff 专属路由靠前端 role 判断是否加入菜单，或者守卫里加 `meta.roles` 兜底。

---

## 八、前端需新建 views 清单

| 优先级 | 角色 | view | 说明 | 依赖后端 |
|---|---|---|---|---|
| P0 | 通用 | **UserProfile.vue** | 个人中心（三角色通用） | GET /users/me, PATCH /users/:id/password ✅ |
| P0 | leader | **ApprovalCenter.vue** | 审批中心（tab1待审批 / tab2已审批） | GET /tickets/todo, GET /tickets/:id ✅ |
| P1 | admin | **ApprovalFlowEditor.vue** | 审批流程配置（JSON 编辑器） | GET/PUT /config/approval-flows ✅ |
| P1 | admin | **BasicDataConfig.vue** | 基础数据配置（dict_type 切换 tab） | CRUD /dictionaries, CRUD /form-configs ✅ |
| P1 | admin | **SlaConfig.vue** | SLA 时效配置 | CRUD /sla-rules, GET/PUT /work-calendars ✅ |
| P2 | leader | **TeamMembers.vue** | 部门成员列表（leader 可见本部门） | GET /users?dept=xxx ✅ |
| P2 | leader | **TeamWorkload.vue** | 成员工单负荷 + 绩效 | GET /stats/workload, /stats/sla ✅ |
| P2 | staff | **MyStats.vue** | 我的统计 | GET /stats/overview（scopeSql 自动过滤） ✅ |
| P2 | staff | **HelpCenter.vue** | 知识库（前端硬编码 Markdown） | ❌ 无后端，v1.0 前端静态 |

**前端已存在的 views（12 个）**：
```
Login, Workbench（壳）, TodoPanel, datalist, WorkOrderList, WorkOrderForm,
WorkOrderDetail, UserList, UserControl, RoleList, deptcontrol, UserLogControl
```
→ 全部可复用，改造点是接 DynamicForm.vue + field:readonly 权限 + 动态路由。

---

## 九、v1.0 vs v2.0 完整边界表

| 能力 | v1.0 现状后端 | v1.0 前端自实现 | v2.0 需后端加 |
|---|---|---|---|
| 三级权限（menu/action/field:readonly） | ✅ role_permissions 表已含 | 动态路由 + 按钮级 + 字段级消费 | — |
| 动态表单引擎 | ✅ form_field_configs 表 + 7 条种子 | DynamicField/DynamicForm 组件 | — |
| 动态路由 | ✅ 无需额外接口 | router.addRoute 按 perm 过滤 | — |
| 审批引擎（多轮多节点 + 状态机） | ✅ 完整 | WorkOrderDetail.vue 审批按钮 | — |
| SLA 全套 | ✅ 规则/记录/事件/日历 | SlaRateChart/SlaRingChart 图表 | — |
| 工单列表高级筛选（12 种 query） | ✅ listTickets 已实现 | WorkOrderList.vue 筛选表单 | — |
| 工单 actions 20 种 | ✅ 全枚举 + 状态机守卫 | WorkOrderDetail.vue 按钮显隐 | — |
| 异常告警 4 种 | ✅ tickets/abnormal | TodoPanel.vue 异常卡 | — |
| 审批流程配置 | ✅ approval_flow_nodes 表 + GET/PUT 整组 | JSON 编辑器 | — |
| 批量审批 | ❌ 无 batch 接口 | 前端循环调单条（无事务） | POST /api/approvals/batch |
| 工单导入导出 | export ✅ import ❌ | — | POST /api/tickets/import |
| 抄送审批 | ❌ approval_records 无 cc 列 | — | cc_user_ids jsonb 列 + 接口 |
| 满意度评分 | ❌ 无 satisfaction 表 | — | ticket_satisfaction 表 |
| 常用模板快速提单 | ❌ 无 ticket_templates 表 | 前端 localStorage | ticket_templates 表 |
| 知识库 | ❌ 无 kb_articles 表 | 前端硬编码 Markdown | kb_articles 表 + CRUD |
| 岗位管理 | ❌ 无 positions 表 | — | positions 表 |
| 审批流程版本/测试 | ❌ approvals_flow_nodes 无 version 列 | — | version/active 列 + 测试端点 |
| 通知触发规则 | ❌ 无 notification_rules 表 | 合并到模板 | notification_rules 表 |
| 强制下线（语义） | ❌ 无 token 黑名单 | PATCH status=锁定（效果等价） | token_blacklist 表 |
| 消息设置 | ❌ 无 user_notification_prefs 表 | — | user_notification_prefs 表 |
| 字段条件联动 visible_when | ❌ form_field_configs 无此列 | — | 加 visible_when jsonb 列 + 条件求值器 |
| 字段条件只读 readonly_when | ❌ form_field_configs 无此列 | — | 加 readonly_when jsonb 列 + 条件求值器 |
