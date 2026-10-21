# 数据库表设计（依据《完整业务权限规则文档》《数据分析权限独立设计文档》）

> 目标库：PostgreSQL（Neon）。本文档纯依据规则文档设计，不兼容旧项目结构。
> 设计铁律（文档「全局公共约束规则」）：状态机 / 审批引擎 / 权限模块三者解耦；后端动态校验角色+状态+数据范围；操作全量留痕；代执行动作必须标记代执行关系。SLA 为独立计时模块，与工单状态分离。

## 0. 角色模型（设计的出发点）

| 角色 | 登录 | 说明 |
|---|---|---|
| 超级管理员 | ✅ | 全平台数据 + 系统配置 + 异常工单兜底；**唯一**可代内置财务部执行报销二级审批与付款完结 |
| 技术部部长 | ✅ | 仅本部门：工单管理、一级审批、故障工单分配、本部门统计 |
| 技术部普通员工 | ✅ | 仅本人：提交、接单处理、确认办结、限时重开 |
| 内置财务部 | ❌ | 系统内置角色，仅承载报销二级审批节点与单据分摊；无登录、无前端入口，动作由超管代执行 |

## 1. 实体关系总览

```
users ──┬──< tickets >──┬── approval_records >── approval_flow_nodes（审批定义）
        │               ├── ticket_logs（动作/状态日志，只追加）
        │               ├── payment_records（报销付款，单工单唯一）
        │               ├── sla_records >── sla_events（SLA 事件，只追加）
        │               │      sla_records >── sla_rules（规则版本快照）
        │               └── notifications（站内通知）>── notification_templates
        ├──< login_logs（登录日志）
        └──< audit_logs（权限/配置变更审计）
work_calendars ──< calendar_special_days（节假日/特殊工作日）
sys_dictionaries（类型/优先级/故障分类等字典）　role_permissions（角色-功能/动作权限）
form_field_configs（自定义表单字段）　system_params（系统参数）
```

## 2. 枚举类型

```sql
CREATE TYPE ticket_type AS ENUM ('fault_repair', 'account_permission', 'reimbursement');
-- 故障报修 / 账号与权限服务 / 报销审批

CREATE TYPE ticket_status AS ENUM (
  'draft',                -- 草稿（审批驳回后落回此态，可修改重提）
  'pending_approval',     -- 待审批（一级/二级审批期间均为此态，节点由审批引擎跟踪）
  'pending_assignment',   -- 待分配（仅故障报修）
  'pending_acceptance',   -- 待接单（仅故障报修）
  'pending_processing',   -- 待处理（报销工单此态=待付款）
  'processing',           -- 处理中
  'pending_confirmation', -- 待确认（仅故障报修）
  'suspended',            -- 已挂起
  'cancelled',            -- 已取消（终态）
  'closed'                -- 已关闭（终态）
);
-- 共 10 态；无 rejected（驳回一律回 draft）、无 updated（升级是动作不是状态）

CREATE TYPE ticket_action AS ENUM (
  'submit','approve','reject_approval','assign','reassign','accept','transfer',
  'start','resolve','confirm','supplement','suspend','resume','cancel','close',
  'reopen','escalate','change_priority','sla_exempt','mark_paid'
);

CREATE TYPE approval_status AS ENUM ('pending','approved','rejected','skipped','cancelled');
-- skipped：按跳过规则未实际执行的节点（如部长本人提交账号工单跳过一级审批）

CREATE TYPE approver_strategy AS ENUM ('dept_leader','super_admin','builtin_finance');
-- 部门部长 / 超级管理员 / 内置财务部（均匀分摊 + 超管代执行）

CREATE TYPE sla_metric AS ENUM
  ('first_response','approval','processing','confirmation','payment','overall');
-- 首次响应 / 审批(逐节点) / 处理 / 确认 / 付款 / 整体完成

CREATE TYPE sla_status AS ENUM
  ('pending','running','paused','met','breached','breached_closed','cancelled');
-- met / breached_closed / cancelled 为终态；breached 非终态（继续累计超时）

CREATE TYPE sla_event_type AS ENUM (
  'sla_created','sla_started','sla_paused','sla_resumed','sla_warning',
  'sla_breached','sla_completed','sla_closed_after_breach','sla_cancelled',
  'sla_deadline_changed','sla_escalated','sla_notification_sent','sla_notification_failed'
);

CREATE TYPE trigger_source AS ENUM ('user','scheduler','business_event','system_rule');
```

## 3. 用户与权限

### 3.1 users

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | serial | PK | |
| username | varchar(50) | UNIQUE NOT NULL | 登录账号，小写 |
| password_hash | varchar(100) | NOT NULL | bcrypt |
| name | varchar(50) | NOT NULL | 姓名 |
| role | varchar(20) | NOT NULL CHECK in ('超级管理员','技术部部长','技术部普通员工') | 3 个登录角色；内置财务部**不在此列**（见 3.3） |
| dept | varchar(50) | NULL | 超管可 NULL；部长/员工如 '技术部'，数据范围判定依据 |
| email | varchar(100) | | |
| status | varchar(10) | NOT NULL DEFAULT '启用' CHECK in ('启用','禁用','锁定') | 禁用/锁定即登录失效；「锁定」对应超管锁定异常账号职责 |
| created_at / updated_at | timestamptz | NOT NULL DEFAULT now() | |

索引：`(role)`、`(dept)`。

### 3.2 role_permissions（角色权限配置 —— 权限模块的规则侧）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | serial | PK | |
| role | varchar(20) | NOT NULL | 登录角色名 |
| perm_code | varchar(50) | NOT NULL | 权限码：`menu:workbench` / `menu:system-config` / `action:assign` / `action:sla_exempt` … |
| created_at | timestamptz | | |

UNIQUE `(role, perm_code)`。种子数据=规则文档 §3 权限矩阵。
**数据范围**（全平台/本部门/本人）不走此表，由后端按角色硬编码三条规则——3 个角色范围是结构性的，做成配置只会增加误判面。

### 3.3 内置财务部的表示方案

不设 users 行（无登录账号）。审批节点分配到内置角色时，`approval_records.assignee_role = 'builtin_finance'` 且 `assignee_id = NULL`；该队列仅聚合进超管待办。代执行关系通过 `acted_by + acted_as` 字段与日志 metadata 标记（见 4.2 / 4.4 / 4.5）。
「均匀分摊」：内置角色只有一个队列，分摊逻辑退化为全部入同一队列；若未来财务角色实例化多人，算法按各实例 pending 数最少者优先，表结构无需变更。

## 4. 工单核心

### 4.1 tickets

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | varchar(20) | PK | 业务单号 `WO+yyyymmdd+4位随机`，后端生成 |
| type | ticket_type | NOT NULL | 决定流转链与审批流 |
| status | ticket_status | NOT NULL DEFAULT 'draft' | 全局 10 态 |
| priority | varchar(20) | NULL | 值取自 sys_dictionaries(type='priority')，字典可配 |
| fault_category | varchar(50) | NULL | 故障分类（仅故障报修），取自字典 |
| title | varchar(200) | NOT NULL | |
| description | text | | |
| dept | varchar(50) | NOT NULL | 所属部门（=申请人部门，部长数据范围依据） |
| applicant_id | int | NOT NULL FK→users | 申请人 |
| current_handler_id | int | NULL FK→users | 当前处理人（assign/accept/transfer/reassign 维护） |
| current_round | int | NOT NULL DEFAULT 0 | 审批轮次，驳回后重新提交 +1 |
| escalated_level | int | NOT NULL DEFAULT 0 | 升级层级（escalate 动作累计，不占状态位） |
| sla_exempt | boolean | NOT NULL DEFAULT false | SLA 手动豁免标记（sla_exempt 动作置位，活跃 sla_records 同步置 cancelled） |
| reopen_count | int | NOT NULL DEFAULT 0 | 重开次数 |
| extra | jsonb | NOT NULL DEFAULT '{}' | 类型扩展字段（报销金额/科目、账号权限明细等） |
| attachments | jsonb | NOT NULL DEFAULT '[]' | `[{name,url}]` |
| version | int | NOT NULL DEFAULT 1 | 乐观锁，并发分配/审批防覆盖 |
| first_submitted_at | timestamptz | NULL | 首次提交时间，驳回重提不重置（overall SLA 固定起点） |
| closed_at | timestamptz | NULL | 进入终态时间（重开时间窗基准） |
| archived_at | timestamptz | NULL | 超管归档历史工单 |
| created_at / updated_at | timestamptz | NOT NULL DEFAULT now() | |
| deleted_at | timestamptz | NULL | 软删除 |

索引：`(status)`、`(type,status)`、`(applicant_id)`、`(current_handler_id)`、`(dept)`、`(deleted_at) WHERE deleted_at IS NULL`。

### 4.2 approval_flow_nodes（审批流程定义 —— 审批引擎规则侧）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | serial | PK | |
| ticket_type | ticket_type | NOT NULL | |
| seq | smallint | NOT NULL | 节点顺序（1=一级，2=二级） |
| node_name | varchar(50) | NOT NULL | 「部门部长审批」「超级管理员审批」「财务审批」 |
| approver_strategy | approver_strategy | NOT NULL | |
| skip_rule | jsonb | NULL | 如 `{"applicant_role":"技术部部长"}` → 账号工单部长本人提交跳过一级审批 |
| active | boolean | NOT NULL DEFAULT true | |
| created_at / updated_at | timestamptz | | |

UNIQUE `(ticket_type, seq)`。种子数据：故障=1 节点(dept_leader)；账号=2 节点(dept_leader+skip_rule, super_admin)；报销=2 节点(dept_leader, builtin_finance)。

### 4.3 approval_records（审批实例 —— 每轮每节点一行）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | bigserial | PK | |
| ticket_id | varchar(20) | NOT NULL FK→tickets | |
| round | int | NOT NULL | 与 tickets.current_round 对应 |
| seq | smallint | NOT NULL | 节点序号（快照，抗定义变更） |
| node_name | varchar(50) | NOT NULL | 快照节点名 |
| assignee_id | int | NULL FK→users | 节点审批人（进入节点时按策略解析） |
| assignee_role | varchar(30) | NULL | `builtin_finance` = 内置财务部队列（assignee_id 为 NULL） |
| status | approval_status | NOT NULL DEFAULT 'pending' | |
| comment | text | NULL | 审批意见；**驳回必填理由** |
| assigned_at | timestamptz | NOT NULL DEFAULT now() | 进入节点时间（approval 指标 SLA 起点） |
| acted_at | timestamptz | NULL | |
| acted_by | int | NULL FK→users | 实际执行人 |
| acted_as | varchar(30) | NULL | `builtin_finance` = 超管代内置财务部执行（代执行标记） |
| business_event_id | varchar(64) | NULL UNIQUE | 幂等键 |
| created_at | timestamptz | NOT NULL DEFAULT now() | |

UNIQUE `(ticket_id, round, seq)`；索引 `(assignee_id,status)`、`(assignee_role,status) WHERE status='pending'`（超管财务待办聚合）、`(ticket_id)`。

### 4.4 ticket_logs（动作/状态日志 —— 只追加）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | bigserial | PK | |
| ticket_id | varchar(20) | NOT NULL FK→tickets | |
| action | ticket_action | NOT NULL | 20 种动作 |
| from_status / to_status | ticket_status | NULL | 状态类动作填前后值；supplement/escalate 等非状态动作为 NULL |
| operator_id | int | NULL FK→users | NULL=系统触发 |
| trigger_source | trigger_source | NOT NULL DEFAULT 'user' | |
| remark | text | | 驳回理由/重开原因/挂起原因（重开、驳回必填） |
| metadata | jsonb | | 扩展：`{"proxy":"builtin_finance"}` 代执行标记、转派前后处理人、优先级前后值、挂起前状态（resume 还原用） |
| business_event_id | varchar(64) | NULL UNIQUE | 幂等键 |
| created_at | timestamptz | NOT NULL DEFAULT now() | |

索引：`(ticket_id, created_at)`。**只追加**；状态 UPDATE + 日志 INSERT 同事务。
代执行日志展示文案由后端生成：「超级管理员（代财务部角色）」。

### 4.5 payment_records（报销付款记录）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | bigserial | PK | |
| ticket_id | varchar(20) | NOT NULL **UNIQUE** FK→tickets | 单工单仅付款一次（幂等硬约束） |
| voucher_no | varchar(64) | NOT NULL | 付款凭证号（mark_paid 动作录入） |
| amount | numeric(12,2) | NOT NULL CHECK (amount > 0) | |
| paid_at | timestamptz | NOT NULL DEFAULT now() | |
| operator_id | int | NOT NULL FK→users | 实际执行人（超管） |
| acted_as | varchar(30) | NOT NULL DEFAULT 'builtin_finance' | 代执行标记 |
| remark | text | | |
| business_event_id | varchar(64) | NULL UNIQUE | |
| created_at | timestamptz | NOT NULL DEFAULT now() | |

## 5. SLA 模块（分指标计时，与工单状态分离）

### 5.1 work_calendars（工作日历）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | serial | PK | |
| name | varchar(50) | NOT NULL UNIQUE | 如「默认日历」 |
| work_days | smallint[] | NOT NULL DEFAULT '{1,2,3,4,5}' | 周一至周五 |
| day_start | time | NOT NULL DEFAULT '09:00' | |
| day_end | time | NOT NULL DEFAULT '18:00' | |
| breaks | jsonb | NOT NULL DEFAULT '[{"start":"12:00","end":"13:00"}]' | 午休等非计时段 |
| timezone | varchar(50) | NOT NULL DEFAULT 'Asia/Shanghai' | |
| active | boolean | NOT NULL DEFAULT true | |

### 5.2 calendar_special_days（节假日 / 调休工作日）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | bigserial | PK | |
| calendar_id | int | NOT NULL FK→work_calendars | |
| day | date | NOT NULL | |
| kind | varchar(20) | NOT NULL CHECK in ('holiday','extra_workday') | |
| name | varchar(50) | | 如「国庆节」 |

UNIQUE `(calendar_id, day)`。

### 5.3 sla_rules（规则配置 —— 版本化）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | serial | PK | |
| ticket_type | ticket_type | NOT NULL | |
| metric_type | sla_metric | NOT NULL | 六类指标 |
| priority | varchar(20) | NULL | 字典 code；NULL=不区分优先级 |
| node_seq | smallint | NULL | 仅 metric_type='approval'：对应审批节点，**逐节点计时** |
| target_value | int | NOT NULL CHECK > 0 | 目标时限数值 |
| target_unit | varchar(20) | NOT NULL | 'minute' / 'work_hour' / 'work_day' / 'natural_day' |
| calendar_id | int | NULL FK→work_calendars | 工作时间计时用；自然时间为 NULL |
| warning_thresholds | jsonb | NOT NULL DEFAULT '[50,75,90]' | 预警百分比（100%=超时，内置） |
| repeat_remind_interval | interval | NULL | 持续超时重复提醒间隔 |
| version | int | NOT NULL DEFAULT 1 | 规则版本 |
| active | boolean | NOT NULL DEFAULT true | |
| created_at / updated_at | timestamptz | | |

UNIQUE `(ticket_type, metric_type, priority, node_seq, version)`。
**变更只新增版本、不改历史**；变更本身写 audit_logs（谁、何时、前后值）。

### 5.4 sla_records（SLA 计时任务）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | bigserial | PK | |
| ticket_id | varchar(20) | NOT NULL FK→tickets | |
| metric_type | sla_metric | NOT NULL | |
| priority | varchar(20) | NULL | 创建时快照的优先级 |
| approval_round | int | NULL | 审批类指标的轮次；非审批类 NULL |
| node_seq | smallint | NULL | 审批类指标的节点；非审批类 NULL |
| rule_version | int | NOT NULL | 采用的规则版本快照 |
| target_snapshot | jsonb | NOT NULL | 目标时限/日历/阈值快照 |
| target_duration | interval | NOT NULL | 目标有效时长 |
| elapsed_duration | interval | NOT NULL DEFAULT '0' | 已累计有效时长 |
| started_at | timestamptz | NULL | 启动时间（pending 时 NULL） |
| deadline_at | timestamptz | NULL | 当前截止时间（暂停恢复后重算） |
| ended_at | timestamptz | NULL | 结束时间 |
| sla_status | sla_status | NOT NULL DEFAULT 'pending' | 独立 SLA 状态机 |
| is_breached | boolean | NOT NULL DEFAULT false | |
| breached_duration | interval | NOT NULL DEFAULT '0' | 累计超时时长 |
| pause_reason | text | NULL | |
| created_at / updated_at | timestamptz | NOT NULL DEFAULT now() | |

索引：`(ticket_id)`、`(sla_status) WHERE sla_status IN ('running','paused','breached')`（定时扫描）、`(deadline_at) WHERE sla_status='running'`。

> 一个工单可同时存在多条：overall + 当前审批节点 + processing/confirmation/payment。
> sla_exempt 动作 → 该单全部活跃记录置 cancelled 并写 `sla_cancelled` 事件（reason=豁免）。

### 5.5 sla_events（SLA 事件日志 —— 只追加）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | bigserial | PK | |
| ticket_id | varchar(20) | NOT NULL FK→tickets | |
| sla_id | bigint | NOT NULL FK→sla_records | |
| event_type | sla_event_type | NOT NULL | 13 类事件 |
| from_status / to_status | sla_status | NULL | 状态类事件必填前后值 |
| event_time | timestamptz | NOT NULL DEFAULT now() | |
| operator_id | int | NULL FK→users | 系统触发为 NULL |
| trigger_source | trigger_source | NOT NULL | |
| business_event_id | varchar(64) | NULL UNIQUE | 幂等去重 |
| elapsed_duration | interval | NULL | 事件时已累计有效时长 |
| remaining_duration | interval | NULL | |
| reason | text | | |
| metadata | jsonb | | 预警阈值、规则版本、补录标记等 |
| created_at | timestamptz | NOT NULL DEFAULT now() | |

索引：`(sla_id, event_time)`、`(ticket_id)`、`(event_type)`。
**同一记录首次进入 breached 只写一条 `sla_breached`**（is_breached 标记+事务保证）；每个预警阈值首次触发各一条 `sla_warning`。

### 5.6 指标定义与计时口径

| metric | 适用类型 | 起点 | 终点 | 挂起暂停 |
|---|---|---|---|---|
| first_response 首次响应 | 全类型 | 每次 submit（含驳回重提新轮） | 首个非申请人动作（approve/reject_approval/assign 先到先得） | 否 |
| approval 审批（逐节点） | 全类型 | approval_records.assigned_at | acted_at | 否 |
| processing 处理 | 故障/账号 | 进入 pending_processing | resolve | 是 |
| confirmation 确认 | 仅故障 | 进入 pending_confirmation | confirm | 是 |
| payment 付款 | 仅报销 | L2 通过进入待付款 | mark_paid | 是 |
| overall 整体完成 | 全类型 | first_submitted_at（驳回重提不重置） | closed / cancelled | 是 |

计时服务（scheduler）：每分钟扫描 running/breached 记录，按日历累计 elapsed_duration、重算剩余，触发 warning/breached 事件与通知；suspend 时活跃记录置 paused，resume 时按剩余时长重算 deadline_at。预警/超时通知是异步副作用，不进状态事务。

### 5.7 存量工单 SLA 补录（一次性迁移脚本，可安全重跑）

1. 对每张未软删工单，按 type + 当前 status 推导应建记录：**overall 必建** + 当前所处阶段对应指标；已过去的阶段不补（metadata 标记 `backfill:true`，视为迁移前数据）。
2. 起点从历史还原：overall→`first_submitted_at`；approval→当前 pending approval_record 的 `assigned_at`；processing/confirmation/payment→ticket_logs 中最近一次进入对应状态的时间；日志缺失时用 `created_at` 兜底并在 metadata 标记 `estimated:true`。
3. 状态判定：起点+target 已早于 now → 直接置 `breached` 并补 `sla_breached` 事件；终态工单的 overall 按 `closed_at` 与 deadline 比较置 `met` / `breached_closed`；已豁免工单全部置 `cancelled`（reason=豁免）。
4. 幂等：`business_event_id = 'backfill:{ticket_id}:{metric}'`，同一工单同一指标重复执行不产生重复记录；`trigger_source='system_rule'`、`operator_id=NULL`。
5. 上线后新工单在动作事务内自动建记录（submit→overall+first_response；进入审批节点→approval；accept→processing；进入待确认→confirmation；L2 通过→payment），不再依赖补录。

## 6. 系统配置域

### 6.1 sys_dictionaries（基础字典：类型/优先级/故障分类等）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | serial | PK | |
| dict_type | varchar(30) | NOT NULL | `ticket_type` / `priority` / `fault_category` / `ticket_status` |
| code | varchar(30) | NOT NULL | 稳定编码（后端状态机/审批流引用 code，不引用 label） |
| label | varchar(50) | NOT NULL | 展示名 |
| sort | smallint | NOT NULL DEFAULT 0 | |
| active | boolean | NOT NULL DEFAULT true | |

UNIQUE `(dict_type, code)`。ticket_type / ticket_status 的 code 与枚举一致，字典仅承载 label 与启停——状态机仍由代码白名单保障，避免改字典改崩流转。

### 6.2 form_field_configs（自定义工单提交表单字段）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | serial | PK | |
| ticket_type | ticket_type | NOT NULL | |
| field_key | varchar(50) | NOT NULL | 存入 tickets.extra 的键 |
| label | varchar(50) | NOT NULL | |
| field_type | varchar(20) | NOT NULL | text / textarea / number / select / date |
| required | boolean | NOT NULL DEFAULT false | |
| options | jsonb | NULL | select 选项 |
| sort | smallint | NOT NULL DEFAULT 0 | |
| active | boolean | NOT NULL DEFAULT true | |

UNIQUE `(ticket_type, field_key)`。后端创建/编辑工单时按此表校验 extra。

### 6.3 notification_templates / notifications

**notification_templates**：`id PK`、`code varchar(50) UNIQUE`（如 `ticket_assigned`/`sla_warning`）、`title`、`content`（支持 `{title}` `{id}` 占位符）、`active`、timestamps。

**notifications**：`id bigserial PK`、`recipient_id int NOT NULL FK→users`、`ticket_id varchar(20) NULL FK→tickets`、`kind varchar(30) NOT NULL`、`title varchar(200)`、`content text`、`read_at timestamptz NULL`、`business_event_id varchar(64) NULL UNIQUE`、`created_at`。

待办列表**不查此表**——待办由 tickets（handler=me 且活跃态）+ approval_records（assignee=me 或 builtin_finance 队列）实时聚合，通知只承担消息触达。

### 6.4 system_params（系统参数）

| 字段 | 类型 | 说明 |
|---|---|---|
| key | varchar(50) PK | 如 `reopen_window_days`(默认7) / `upload_max_mb`(默认5) / `login_max_retry` / `sla_scan_interval_sec`(默认60) |
| value | jsonb NOT NULL | |
| description | varchar(200) | |
| updated_at / updated_by | | 变更同时写 audit_logs |

### 6.5 login_logs / audit_logs

**login_logs**：`id bigserial PK`、`user_id int FK→users`、`username varchar(50)`、`success boolean`、`ip inet`、`user_agent text`、`created_at`。登录失败也留痕（锁定判定依据）。

**audit_logs**（权限/配置变更审计，只追加）：`id bigserial PK`、`actor_id int FK→users`、`target_type varchar(30)`（user/role_permission/dictionary/flow_node/sla_rule/form_field/system_param）、`target_id varchar(50)`、`action varchar(30)`、`before jsonb`、`after jsonb`、`created_at`。索引 `(target_type,target_id)`、`(actor_id)`。

## 7. 状态机流转表（三类工单链路 + 通用分支）

### 7.1 故障报修 fault_repair

`草稿 → 待审批 →(L1通过) → 待分配 →(分配) → 待接单 →(接单) → 待处理 →(开始处理) → 处理中 →(提交结果) → 待确认 →(确认办结) → 已关闭`

| 动作 | from → to | 执行人 |
|---|---|---|
| submit | draft → pending_approval | 申请人（首轮或驳回后重提，round+1） |
| approve(L1) / reject_approval | pending_approval → pending_assignment / **draft** | 本部门部长 |
| assign / reassign | pending_assignment→pending_acceptance / pending_acceptance→pending_acceptance | 部长(本部门)/超管，指定/更换处理人 |
| accept | pending_acceptance → pending_processing | 当前处理人 |
| transfer | pending_processing/processing → pending_acceptance | 部长/超管，新处理人需重新接单 |
| start | pending_processing → processing | 处理人 |
| resolve（提交结果） | processing → pending_confirmation | 处理人 |
| confirm（确认办结） | pending_confirmation → closed | 申请人 |

### 7.2 账号与权限服务 account_permission

`草稿 → 待审批(L1部长；申请人=部长时 skipped 自动跳过) → 待审批(L2超管) → 待处理 → 处理中 → 已关闭`

| 动作 | from → to | 执行人 |
|---|---|---|
| approve(L1) / approve(L2) | pending_approval → 节点推进；末节点通过 → pending_processing | 部长 / 超管 |
| reject_approval | pending_approval → draft | 当前节点审批人 |
| cancel | pending_approval → cancelled | 超管（L2 节点显式支持取消） |
| start / resolve | pending_processing→processing / processing→**closed**（无待确认环节） | 处理人 |

> 已确认：末节点通过后 `current_handler_id=超管`（完成操作的处理人只能是超管），超管执行 start/resolve 办结。

### 7.3 报销审批 reimbursement

`草稿 → 待审批(L1部长) → 待审批(L2内置财务部队列，超管待办可见) → 待处理(=待付款) →(标记付款完成) → 已关闭`

| 动作 | from → to | 执行人 |
|---|---|---|
| approve(L1) | pending_approval → pending_approval（生成财务节点记录，assignee_role=builtin_finance） | 部长；超管可兜底干预 |
| approve(L2) | pending_approval → pending_processing | **超管代财务**（acted_as=builtin_finance） |
| reject_approval（任意节点） | pending_approval → draft（历史轮次完整保留） | 当前节点审批人/代执行人 |
| mark_paid | pending_processing/processing → closed | **超管代财务**，录入凭证号+金额，写 payment_records |

### 7.4 通用分支动作（全类型适用）

| 动作 | 状态影响 | 执行人 |
|---|---|---|
| supplement（补充材料） | 不变，仅写日志 | 申请人（非终态） |
| suspend / resume | 活跃态→suspended / suspended→原状态（metadata 记录挂起前状态）；活跃 sla_records 同步 paused/恢复重算 deadline | 部长(本部门)/超管 |
| cancel | 非终态→cancelled | 申请人(本人)/超管 |
| reopen（限时重开） | closed→pending_processing，reopen_count+1，**remark 必填**，窗口=system_params.reopen_window_days | 申请人(本人限时)/部长/超管 |
| escalate（升级） | 不变，escalated_level+1，通知部长/超管 | 部长(本部门)/超管 |
| change_priority | 不变，metadata 记前后值 | 部长(本部门)/超管 |
| sla_exempt | sla_exempt=true；该单活跃 sla_records 置 cancelled（写 sla_cancelled 事件） | 部长(本部门)/超管 |

## 8. 关键机制落地点

| 规则 | 实现 |
|---|---|
| 三者解耦 | 状态机=后端 from→to 白名单校验；审批引擎=approval_flow_nodes+approval_records 节点推进；权限模块=role 硬规则(数据范围)+role_permissions(动作/菜单)，互不调用内部逻辑 |
| 权限动态校验 | 每个接口依次校验：登录态 → 角色动作权限 → 数据范围 → 工单当前状态，任一不过即拒（403/404/409） |
| 代执行标记 | approval_records.acted_as、payment_records.acted_as、ticket_logs.metadata.proxy 三处一致落 `builtin_finance` |
| 重复操作幂等 | business_event_id UNIQUE（approval_records/ticket_logs/payment_records/sla_events/notifications）；补录脚本用 `backfill:{ticket}:{metric}` 键 |
| 并发防覆盖 | tickets.version 乐观锁，`UPDATE ... WHERE id=$1 AND version=$2`，rowCount=0 即 409 |
| 全量追溯 | 工单动作→ticket_logs；SLA→sla_events；登录→login_logs；权限/配置变更→audit_logs，均只追加 |
| 数据与日志一致 | 状态 UPDATE + approval_records + ticket_logs + sla_records/sla_events + payment_records 同一事务；通知异步 |
| 重开边界 | closed_at + reopen_window_days 参数 + remark 必填 + reopen_count 计数 |
| 财务队列可见性 | 仅超管待办聚合 `assignee_role='builtin_finance' AND status='pending'`；部长/员工查询无条件排除 |
| SLA 规则版本化 | sla_rules 只增版本；sla_records 存 rule_version + target_snapshot，历史可追溯 |
| 多级审批逐节点计时 | sla_records.metric_type='approval' + node_seq + approval_round，不合并 |

## 9. 数据分析模块（统计口径，无新增表）

> 依据《数据分析权限独立设计文档》。五大维度全部基于现有表**实时聚合**，不建汇总表；数据范围过滤与工单接口共用同一套规则（角色 > 页面筛选，改参数无法越权）。

| 维度 | 指标 | 数据来源与口径 |
|---|---|---|
| 数据聚合规模 | 总量/新增/完结/未完结/取消/驳回 | tickets 按周期（created_at / closed_at 落入）计数；取消=status cancelled；驳回=ticket_logs action='reject_approval' 周期内计数 |
| 人员工作量 | 接单/处理/完结/驳回/取消/人均 | ticket_logs 按 operator_id 分组：accept=接单、start=处理、resolve=完结、reject_approval=驳回、cancel=取消；人均=合计/部门人数 |
| 超时率 | 整体/响应/审批/处理超时率、平均超时时长、超时明细 | sla_records 按 metric_type 分组（overall/first_response/approval/processing）：超时率=(breached+breached_closed)/记录总数，均值=avg(breached_duration)；豁免单（cancelled 记录）不计入分母 |
| 趋势 | 新增/完结/超时趋势 + 同期对比 | tickets.created_at、tickets.closed_at、sla_events(event_type='sla_breached').event_time，按 date_trunc(period) 分桶；同期=上一等长周期同口径序列 |
| 状态分布 | 10 状态 + 超时未完结 | tickets.status 分组计数与占比；「超时未完结」为派生项=overall 记录 is_breached=true 且工单非终态，单列不占用状态枚举 |

- period（day/week/month/quarter/year）由后端翻译成 `date_trunc` 分桶键，时区 Asia/Shanghai
- 员工角色五维度均可查，但范围强制本人；工作量/超时明细按人员分组时仅返回本人行，无排行数据

## 10. 设计取舍与已确认

**已确认（2026-10-22 拍板）**

1. 账号工单末节点通过后处理人默认**超管**——完成操作的处理人只能是超管（见 7.2）。
2. SLA 采用**分指标计时引擎**（§5 五张表）；存量工单按 §5.7 补录脚本一次性建记录，幂等可重跑。
3. 沿用此前决策：驳回回 draft、升级不占状态位、内置财务部非登录角色。

**取舍说明**

4. role_permissions 管菜单+动作码；数据范围三规则硬编码。文档虽提「新建系统角色」，但全文围绕 3 个固定登录角色展开，未实现通用建角色。
5. transfer 后需新处理人重新接单（→pending_acceptance），文档未明示，按「接单」语义推导。
