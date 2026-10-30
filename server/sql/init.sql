-- =============================================================
-- OA 工单系统建库脚本（严格依据 docs/database-design.md）
-- 目标库：PostgreSQL（Neon）。drop-and-recreate，不兼容旧结构。
-- =============================================================

-- ---------- 旧结构清理（含 legacy 表） ----------
DROP TABLE IF EXISTS audit_logs, login_logs, system_params, notifications, notification_templates,
  form_field_configs, sys_dictionaries, sla_events, sla_records, sla_rules,
  calendar_special_days, work_calendars, payment_records, ticket_logs,
  approval_records, approval_flow_nodes, tickets, role_permissions, users,
  order_logs, orders, announcements CASCADE;

DROP TYPE IF EXISTS ticket_type, ticket_status, ticket_action, approval_status,
  approver_strategy, sla_metric, sla_status, sla_event_type, trigger_source CASCADE;

-- ---------- 枚举类型（文档 §2） ----------
CREATE TYPE ticket_type AS ENUM ('fault_repair', 'account_permission', 'reimbursement');

CREATE TYPE ticket_status AS ENUM (
  'draft', 'pending_approval', 'pending_assignment', 'pending_acceptance',
  'pending_processing', 'processing', 'pending_confirmation',
  'suspended', 'cancelled', 'closed'
);

CREATE TYPE ticket_action AS ENUM (
  'submit','approve','reject_approval','assign','reassign','accept','transfer',
  'start','resolve','confirm','supplement','suspend','resume','cancel','close',
  'reopen','escalate','change_priority','sla_exempt','mark_paid'
);

CREATE TYPE approval_status AS ENUM ('pending','approved','rejected','skipped','cancelled');

CREATE TYPE approver_strategy AS ENUM ('dept_leader','super_admin','builtin_finance');

CREATE TYPE sla_metric AS ENUM
  ('first_response','approval','processing','confirmation','payment','overall');

CREATE TYPE sla_status AS ENUM
  ('pending','running','paused','met','breached','breached_closed','cancelled');

CREATE TYPE sla_event_type AS ENUM (
  'sla_created','sla_started','sla_paused','sla_resumed','sla_warning',
  'sla_breached','sla_completed','sla_closed_after_breach','sla_cancelled',
  'sla_deadline_changed','sla_escalated','sla_notification_sent','sla_notification_failed'
);

CREATE TYPE trigger_source AS ENUM ('user','scheduler','business_event','system_rule');

-- ---------- 3.1 users ----------
CREATE TABLE users (
  id            serial PRIMARY KEY,
  username      varchar(50)  NOT NULL UNIQUE,
  password_hash varchar(100) NOT NULL,
  name          varchar(50)  NOT NULL,
  role          varchar(20)  NOT NULL CHECK (role IN ('超级管理员','技术部部长','技术部普通员工')),
  dept          varchar(50),
  email         varchar(100),
  status        varchar(10)  NOT NULL DEFAULT '启用' CHECK (status IN ('启用','禁用','锁定')),
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_dept ON users(dept);

-- ---------- 3.2 role_permissions ----------
CREATE TABLE role_permissions (
  id         serial PRIMARY KEY,
  role       varchar(20) NOT NULL,
  perm_code  varchar(50) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, perm_code)
);

-- ---------- 6.1 sys_dictionaries ----------
CREATE TABLE sys_dictionaries (
  id        serial PRIMARY KEY,
  dict_type varchar(30) NOT NULL,
  code      varchar(30) NOT NULL,
  label     varchar(50) NOT NULL,
  sort      smallint    NOT NULL DEFAULT 0,
  active    boolean     NOT NULL DEFAULT true,
  UNIQUE (dict_type, code)
);

-- ---------- 4.1 tickets ----------
CREATE TABLE tickets (
  id                 varchar(20) PRIMARY KEY,
  type               ticket_type   NOT NULL,
  status             ticket_status NOT NULL DEFAULT 'draft',
  priority           varchar(20),
  fault_category     varchar(50),
  title              varchar(200)  NOT NULL,
  description        text,
  dept               varchar(50)   NOT NULL,
  applicant_id       int           NOT NULL REFERENCES users(id),
  current_handler_id int           REFERENCES users(id),
  current_round      int           NOT NULL DEFAULT 0,
  escalated_level    int           NOT NULL DEFAULT 0,
  sla_exempt         boolean       NOT NULL DEFAULT false,
  reopen_count       int           NOT NULL DEFAULT 0,
  extra              jsonb         NOT NULL DEFAULT '{}',
  attachments        jsonb         NOT NULL DEFAULT '[]',
  version            int           NOT NULL DEFAULT 1,
  first_submitted_at timestamptz,
  closed_at          timestamptz,
  archived_at        timestamptz,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE INDEX idx_tickets_status    ON tickets(status);
CREATE INDEX idx_tickets_type_st   ON tickets(type, status);
CREATE INDEX idx_tickets_applicant ON tickets(applicant_id);
CREATE INDEX idx_tickets_handler   ON tickets(current_handler_id);
CREATE INDEX idx_tickets_dept      ON tickets(dept);
CREATE INDEX idx_tickets_alive     ON tickets(deleted_at) WHERE deleted_at IS NULL;

-- ---------- 4.2 approval_flow_nodes ----------
CREATE TABLE approval_flow_nodes (
  id                serial PRIMARY KEY,
  ticket_type       ticket_type        NOT NULL,
  seq               smallint           NOT NULL,
  node_name         varchar(50)        NOT NULL,
  approver_strategy approver_strategy  NOT NULL,
  skip_rule         jsonb,
  active            boolean            NOT NULL DEFAULT true,
  created_at        timestamptz        NOT NULL DEFAULT now(),
  updated_at        timestamptz        NOT NULL DEFAULT now(),
  UNIQUE (ticket_type, seq)
);

-- ---------- 4.3 approval_records ----------
CREATE TABLE approval_records (
  id                bigserial PRIMARY KEY,
  ticket_id         varchar(20)     NOT NULL REFERENCES tickets(id),
  round             int             NOT NULL,
  seq               smallint        NOT NULL,
  node_name         varchar(50)     NOT NULL,
  assignee_id       int             REFERENCES users(id),
  assignee_role     varchar(30),
  status            approval_status NOT NULL DEFAULT 'pending',
  comment           text,
  assigned_at       timestamptz     NOT NULL DEFAULT now(),
  acted_at          timestamptz,
  acted_by          int             REFERENCES users(id),
  acted_as          varchar(30),
  business_event_id varchar(64)     UNIQUE,
  created_at        timestamptz     NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, round, seq)
);
CREATE INDEX idx_approval_assignee ON approval_records(assignee_id, status);
CREATE INDEX idx_approval_finance  ON approval_records(assignee_role, status) WHERE status = 'pending';
CREATE INDEX idx_approval_ticket   ON approval_records(ticket_id);

-- ---------- 4.4 ticket_logs（只追加） ----------
CREATE TABLE ticket_logs (
  id                bigserial PRIMARY KEY,
  ticket_id         varchar(20)   NOT NULL REFERENCES tickets(id),
  action            ticket_action NOT NULL,
  from_status       ticket_status,
  to_status         ticket_status,
  operator_id       int           REFERENCES users(id),
  trigger_source    trigger_source NOT NULL DEFAULT 'user',
  remark            text,
  metadata          jsonb,
  business_event_id varchar(64)   UNIQUE,
  created_at        timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX idx_ticket_logs_ticket ON ticket_logs(ticket_id, created_at);
CREATE INDEX idx_ticket_logs_action ON ticket_logs(action, created_at);
CREATE INDEX idx_ticket_logs_operator ON ticket_logs(operator_id, created_at);

-- ---------- 4.5 payment_records ----------
CREATE TABLE payment_records (
  id                bigserial PRIMARY KEY,
  ticket_id         varchar(20)    NOT NULL UNIQUE REFERENCES tickets(id),
  voucher_no        varchar(64)    NOT NULL,
  amount            numeric(12,2)  NOT NULL CHECK (amount > 0),
  paid_at           timestamptz    NOT NULL DEFAULT now(),
  operator_id       int            NOT NULL REFERENCES users(id),
  acted_as          varchar(30)    NOT NULL DEFAULT 'builtin_finance',
  remark            text,
  business_event_id varchar(64)    UNIQUE,
  created_at        timestamptz    NOT NULL DEFAULT now()
);

-- ---------- 5.1 work_calendars ----------
CREATE TABLE work_calendars (
  id        serial PRIMARY KEY,
  name      varchar(50) NOT NULL UNIQUE,
  work_days smallint[]  NOT NULL DEFAULT '{1,2,3,4,5}',
  day_start time        NOT NULL DEFAULT '09:00',
  day_end   time        NOT NULL DEFAULT '18:00',
  breaks    jsonb       NOT NULL DEFAULT '[{"start":"12:00","end":"13:00"}]',
  timezone  varchar(50) NOT NULL DEFAULT 'Asia/Shanghai',
  active    boolean     NOT NULL DEFAULT true
);

-- ---------- 5.2 calendar_special_days ----------
CREATE TABLE calendar_special_days (
  id          bigserial PRIMARY KEY,
  calendar_id int         NOT NULL REFERENCES work_calendars(id),
  day         date        NOT NULL,
  kind        varchar(20) NOT NULL CHECK (kind IN ('holiday','extra_workday')),
  name        varchar(50),
  UNIQUE (calendar_id, day)
);

-- ---------- 5.3 sla_rules（版本化，只增不改） ----------
CREATE TABLE sla_rules (
  id                     serial PRIMARY KEY,
  ticket_type            ticket_type NOT NULL,
  metric_type            sla_metric  NOT NULL,
  priority               varchar(20),
  node_seq               smallint,
  target_value           int         NOT NULL CHECK (target_value > 0),
  target_unit            varchar(20) NOT NULL CHECK (target_unit IN ('minute','work_hour','work_day','natural_day')),
  calendar_id            int         REFERENCES work_calendars(id),
  warning_thresholds     jsonb       NOT NULL DEFAULT '[50,75,90]',
  repeat_remind_interval interval,
  version                int         NOT NULL DEFAULT 1,
  active                 boolean     NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_type, metric_type, priority, node_seq, version)
);

-- ---------- 5.4 sla_records ----------
CREATE TABLE sla_records (
  id                bigserial PRIMARY KEY,
  ticket_id         varchar(20) NOT NULL REFERENCES tickets(id),
  metric_type       sla_metric  NOT NULL,
  priority          varchar(20),
  approval_round    int,
  node_seq          smallint,
  rule_version      int         NOT NULL,
  target_snapshot   jsonb       NOT NULL,
  target_duration   interval    NOT NULL,
  elapsed_duration  interval    NOT NULL DEFAULT '0',
  started_at        timestamptz,
  deadline_at       timestamptz,
  ended_at          timestamptz,
  sla_status        sla_status  NOT NULL DEFAULT 'pending',
  is_breached       boolean     NOT NULL DEFAULT false,
  breached_duration interval    NOT NULL DEFAULT '0',
  pause_reason      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sla_records_ticket ON sla_records(ticket_id);
CREATE INDEX idx_sla_records_scan   ON sla_records(sla_status) WHERE sla_status IN ('running','paused','breached');
CREATE INDEX idx_sla_records_deadline ON sla_records(deadline_at) WHERE sla_status = 'running';

-- ---------- 5.5 sla_events（只追加） ----------
CREATE TABLE sla_events (
  id                bigserial PRIMARY KEY,
  ticket_id         varchar(20)    NOT NULL REFERENCES tickets(id),
  sla_id            bigint         NOT NULL REFERENCES sla_records(id),
  event_type        sla_event_type NOT NULL,
  from_status       sla_status,
  to_status         sla_status,
  event_time        timestamptz    NOT NULL DEFAULT now(),
  operator_id       int            REFERENCES users(id),
  trigger_source    trigger_source NOT NULL,
  business_event_id varchar(64)    UNIQUE,
  elapsed_duration  interval,
  remaining_duration interval,
  reason            text,
  metadata          jsonb,
  created_at        timestamptz    NOT NULL DEFAULT now()
);
CREATE INDEX idx_sla_events_sla    ON sla_events(sla_id, event_time);
CREATE INDEX idx_sla_events_ticket ON sla_events(ticket_id);
CREATE INDEX idx_sla_events_type   ON sla_events(event_type);

-- ---------- 6.2 form_field_configs ----------
CREATE TABLE form_field_configs (
  id          serial PRIMARY KEY,
  ticket_type ticket_type NOT NULL,
  field_key   varchar(50) NOT NULL,
  label       varchar(50) NOT NULL,
  field_type  varchar(20) NOT NULL CHECK (field_type IN ('text','textarea','number','select','date')),
  required    boolean     NOT NULL DEFAULT false,
  options     jsonb,
  sort        smallint    NOT NULL DEFAULT 0,
  active      boolean     NOT NULL DEFAULT true,
  UNIQUE (ticket_type, field_key)
);

-- ---------- 6.3 notification_templates / notifications ----------
CREATE TABLE notification_templates (
  id         serial PRIMARY KEY,
  code       varchar(50) NOT NULL UNIQUE,
  title      varchar(200) NOT NULL,
  content    text         NOT NULL,
  active     boolean      NOT NULL DEFAULT true,
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id                bigserial PRIMARY KEY,
  recipient_id      int         NOT NULL REFERENCES users(id),
  ticket_id         varchar(20) REFERENCES tickets(id),
  kind              varchar(30) NOT NULL,
  title             varchar(200),
  content           text,
  read_at           timestamptz,
  business_event_id varchar(64) UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, created_at);

-- ---------- 6.4 system_params ----------
CREATE TABLE system_params (
  key         varchar(50) PRIMARY KEY,
  value       jsonb        NOT NULL,
  description varchar(200),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  updated_by  int          REFERENCES users(id)
);

-- ---------- 6.5 login_logs / audit_logs ----------
CREATE TABLE login_logs (
  id         bigserial PRIMARY KEY,
  user_id    int         REFERENCES users(id),
  username   varchar(50),
  success    boolean     NOT NULL,
  ip         inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_logs_user ON login_logs(username, created_at);

CREATE TABLE audit_logs (
  id          bigserial PRIMARY KEY,
  actor_id    int         REFERENCES users(id),
  target_type varchar(30) NOT NULL,
  target_id   varchar(50),
  action      varchar(30) NOT NULL,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX idx_audit_logs_actor  ON audit_logs(actor_id);

-- =============================================================
-- 种子数据
-- =============================================================

-- 3 个登录角色账号（初始密码 123456）
INSERT INTO users (id, username, password_hash, name, role, dept, email) VALUES
  (1, 'admin',  '$2b$10$9IUfW/Cn5obRPNPESXD2jeUFNrz5tR0r4uaLzA0Q53wKDwIqfnGJe', '陈超',   '超级管理员',     NULL,     'admin@example.com'),
  (2, 'leader', '$2b$10$9IUfW/Cn5obRPNPESXD2jeUFNrz5tR0r4uaLzA0Q53wKDwIqfnGJe', '王建国', '技术部部长',     '技术部', 'leader@example.com'),
  (3, 'staff',  '$2b$10$9IUfW/Cn5obRPNPESXD2jeUFNrz5tR0r4uaLzA0Q53wKDwIqfnGJe', '李晓',   '技术部普通员工', '技术部', 'staff@example.com'),
  (4, 'staff2', '$2b$10$9IUfW/Cn5obRPNPESXD2jeUFNrz5tR0r4uaLzA0Q53wKDwIqfnGJe', '赵敏',   '技术部普通员工', '技术部', 'staff2@example.com');
SELECT setval('users_id_seq', (SELECT max(id) FROM users));

-- 角色权限矩阵（api-design.md §0.2）
INSERT INTO role_permissions (role, perm_code) VALUES
  -- 菜单
  ('超级管理员','menu:workbench'), ('技术部部长','menu:workbench'), ('技术部普通员工','menu:workbench'),
  ('超级管理员','menu:tickets'),   ('技术部部长','menu:tickets'),   ('技术部普通员工','menu:tickets'),
  ('超级管理员','menu:stats'),     ('技术部部长','menu:stats'),     ('技术部普通员工','menu:stats'),
  ('超级管理员','menu:system-config'), ('超级管理员','menu:user-manage'), ('超级管理员','menu:logs'),
  -- 业务菜单：审批中心/团队管理（部长专属）；工单创建入口（员工专属）
  ('技术部部长','menu:approval-center'),
  ('技术部部长','menu:team-manage'),
  ('技术部普通员工','menu:work-order-create'),
  -- 全员动作
  ('超级管理员','action:submit'),   ('技术部部长','action:submit'),   ('技术部普通员工','action:submit'),
  ('超级管理员','action:supplement'),('技术部部长','action:supplement'),('技术部普通员工','action:supplement'),
  ('超级管理员','action:cancel'),   ('技术部部长','action:cancel'),   ('技术部普通员工','action:cancel'),
  ('超级管理员','action:confirm'),  ('技术部部长','action:confirm'),  ('技术部普通员工','action:confirm'),
  ('超级管理员','action:reopen'),   ('技术部部长','action:reopen'),   ('技术部普通员工','action:reopen'),
  -- 超管 + 部长动作
  ('超级管理员','action:approve'),         ('技术部部长','action:approve'),
  ('超级管理员','action:reject_approval'), ('技术部部长','action:reject_approval'),
  ('超级管理员','action:assign'),          ('技术部部长','action:assign'),
  ('超级管理员','action:reassign'),        ('技术部部长','action:reassign'),
  ('超级管理员','action:transfer'),        ('技术部部长','action:transfer'),
  ('超级管理员','action:suspend'),         ('技术部部长','action:suspend'),
  ('超级管理员','action:resume'),          ('技术部部长','action:resume'),
  ('超级管理员','action:escalate'),        ('技术部部长','action:escalate'),
  ('超级管理员','action:change_priority'), ('技术部部长','action:change_priority'),
  ('超级管理员','action:sla_exempt'),      ('技术部部长','action:sla_exempt'),
  -- 超管 + 员工动作（处理人链路；超管仅异常兜底）
  ('超级管理员','action:accept'),  ('技术部普通员工','action:accept'),
  ('超级管理员','action:start'),   ('技术部普通员工','action:start'),
  ('超级管理员','action:resolve'), ('技术部普通员工','action:resolve'),
  -- 仅超管
  ('超级管理员','action:mark_paid'), ('超级管理员','stats:export'),
  -- 字段级只读权限（field:readonly:{field_key}）
  -- 普通员工：账号权限工单里的"权限类型"由审批后确定，提交时只读；设备编号由超管分配，提交时只读
  ('技术部普通员工','field:readonly:permType'),
  ('技术部普通员工','field:readonly:deviceNo'),
  -- 部长在审批阶段只读 applicant 填的 description（示例，实际按业务调整）
  ('技术部部长','field:readonly:amount'),
  ('技术部部长','field:readonly:subject');

-- 基础字典
INSERT INTO sys_dictionaries (dict_type, code, label, sort) VALUES
  ('ticket_type','fault_repair','故障报修',1),
  ('ticket_type','account_permission','账号与权限服务',2),
  ('ticket_type','reimbursement','报销审批',3),
  ('priority','low','低',1), ('priority','medium','中',2),
  ('priority','high','高',3), ('priority','urgent','紧急',4),
  ('fault_category','network','网络故障',1), ('fault_category','hardware','硬件故障',2),
  ('fault_category','software','软件故障',3), ('fault_category','other','其他',4),
  ('ticket_status','draft','草稿',1), ('ticket_status','pending_approval','待审批',2),
  ('ticket_status','pending_assignment','待分配',3), ('ticket_status','pending_acceptance','待接单',4),
  ('ticket_status','pending_processing','待处理',5), ('ticket_status','processing','处理中',6),
  ('ticket_status','pending_confirmation','待确认',7), ('ticket_status','suspended','已挂起',8),
  ('ticket_status','cancelled','已取消',9), ('ticket_status','closed','已关闭',10);

-- 审批流程定义（文档 §4.2 种子）
INSERT INTO approval_flow_nodes (ticket_type, seq, node_name, approver_strategy, skip_rule) VALUES
  ('fault_repair',       1, '部门部长审批',   'dept_leader',     NULL),
  ('account_permission', 1, '部门部长审批',   'dept_leader',     '{"applicant_role":"技术部部长"}'),
  ('account_permission', 2, '超级管理员审批', 'super_admin',     NULL),
  ('reimbursement',      1, '部门部长审批',   'dept_leader',     NULL),
  ('reimbursement',      2, '财务审批',       'builtin_finance', NULL);

-- 默认工作日历
INSERT INTO work_calendars (id, name) VALUES (1, '默认日历');
SELECT setval('work_calendars_id_seq', (SELECT max(id) FROM work_calendars));

-- SLA 规则（version=1，priority NULL=不区分优先级）
INSERT INTO sla_rules (ticket_type, metric_type, node_seq, target_value, target_unit, calendar_id) VALUES
  ('fault_repair',       'overall',        NULL, 3, 'natural_day', NULL),
  ('account_permission', 'overall',        NULL, 2, 'natural_day', NULL),
  ('reimbursement',      'overall',        NULL, 5, 'natural_day', NULL),
  ('fault_repair',       'first_response', NULL, 4, 'work_hour',   1),
  ('account_permission', 'first_response', NULL, 4, 'work_hour',   1),
  ('reimbursement',      'first_response', NULL, 4, 'work_hour',   1),
  ('fault_repair',       'approval',       1,    1, 'work_day',    1),
  ('account_permission', 'approval',       1,    1, 'work_day',    1),
  ('account_permission', 'approval',       2,    1, 'work_day',    1),
  ('reimbursement',      'approval',       1,    1, 'work_day',    1),
  ('reimbursement',      'approval',       2,    2, 'work_day',    1),
  ('fault_repair',       'processing',     NULL, 2, 'work_day',    1),
  ('account_permission', 'processing',     NULL, 1, 'work_day',    1),
  ('fault_repair',       'confirmation',   NULL, 1, 'natural_day', NULL),
  ('reimbursement',      'payment',        NULL, 2, 'work_day',    1);

-- 系统参数
INSERT INTO system_params (key, value, description) VALUES
  ('reopen_window_days',   '7',  '已关闭工单限时重开窗口（天）'),
  ('upload_max_mb',        '5',  '附件大小上限（MB）'),
  ('login_max_retry',      '5',  '连续登录失败自动锁定阈值'),
  ('sla_scan_interval_sec','60', 'SLA 定时扫描间隔（秒）');

-- 站内通知模板
INSERT INTO notification_templates (code, title, content) VALUES
  ('ticket_assigned','工单待接单','您有新的工单待接单：{title}（{id}）'),
  ('ticket_approved','审批通过','您的工单已通过审批：{title}（{id}）'),
  ('ticket_rejected','审批驳回','您的工单被驳回：{title}（{id}），原因：{reason}'),
  ('ticket_resolved','处理结果待确认','您的工单已提交处理结果，请确认办结：{title}（{id}）'),
  ('ticket_escalated','工单升级提醒','工单已升级（{level} 级）：{title}（{id}）'),
  ('sla_warning','SLA 预警','工单 {id} 的 {metric} 指标已消耗 {threshold}% 时限，请及时处理'),
  ('sla_breached','SLA 超时','工单 {id} 的 {metric} 指标已超时，请立即处理');

-- 自定义表单字段
INSERT INTO form_field_configs (ticket_type, field_key, label, field_type, required, options, sort) VALUES
  ('reimbursement','amount','报销金额（元）','number',true,NULL,1),
  ('reimbursement','subject','报销科目','select',true,'["办公用品","差旅费","招待费","其他"]',2),
  ('account_permission','system','目标系统','select',true,'["OA","邮箱","VPN","ERP"]',1),
  ('account_permission','permType','权限类型','select',true,'["新增","变更","注销"]',2),
  -- 故障报修（前端 DynamicForm 字段联动测试用）
  ('fault_repair','deviceNo','设备编号','text',true,NULL,1),
  ('fault_repair','deviceType','设备类型','select',true,'["电脑","打印机","服务器","路由器"]',2),
  ('fault_repair','faultDesc','故障描述','textarea',false,NULL,3);

-- ---------- 演示工单（SLA 记录由 scripts/backfillSla.js 补录） ----------
INSERT INTO tickets (id, type, status, priority, fault_category, title, description, dept,
                     applicant_id, current_handler_id, current_round, first_submitted_at, closed_at,
                     created_at, updated_at) VALUES
  -- 1. 故障草稿
  ('WO00000000000001','fault_repair','draft','medium','hardware',
   '演示：工位电脑无法开机','按下电源键无反应，疑似电源故障。','技术部',3,NULL,0,NULL,NULL,
   now() - interval '3 days', now() - interval '3 days'),
  -- 2. 故障待审批（L1 pending → 部长）
  ('WO00000000000002','fault_repair','pending_approval','high','network',
   '演示：会议室网络中断','三楼会议室交换机无信号。','技术部',3,NULL,1,
   now() - interval '2 days', NULL, now() - interval '2 days', now() - interval '2 days'),
  -- 3. 故障处理中（处理人=赵敏）
  ('WO00000000000003','fault_repair','processing','medium','software',
   '演示：OA 系统登录报错','登录后白屏，控制台报 500。','技术部',3,4,1,
   now() - interval '4 days', NULL, now() - interval '4 days', now() - interval '1 day'),
  -- 4. 账号工单待 L2 审批（部长本人提交，L1 skipped）
  ('WO00000000000004','account_permission','pending_approval','low',NULL,
   '演示：申请开通 ERP 查询权限','部门数据核对需要 ERP 只读权限。','技术部',2,NULL,1,
   now() - interval '1 day', NULL, now() - interval '1 day', now() - interval '1 day'),
  -- 5. 报销单待财务审批（L2 内置财务部队列）
  ('WO00000000000005','reimbursement','pending_approval','medium',NULL,
   '演示：差旅费报销','出差客户现场交通住宿费用。','技术部',3,NULL,1,
   now() - interval '5 days', NULL, now() - interval '5 days', now() - interval '3 days'),
  -- 6. 故障已关闭（完整链路）
  ('WO00000000000006','fault_repair','closed','low','other',
   '演示：更换鼠标','鼠标左键失灵，已更换新鼠标。','技术部',3,4,1,
   now() - interval '6 days', now() - interval '2 hours', now() - interval '6 days', now() - interval '2 hours');

UPDATE tickets SET extra = '{"amount": 1280.50, "subject": "差旅费"}' WHERE id = 'WO00000000000005';
UPDATE tickets SET extra = '{"system": "ERP", "permType": "新增"}' WHERE id = 'WO00000000000004';

-- 演示审批记录
INSERT INTO approval_records (ticket_id, round, seq, node_name, assignee_id, assignee_role, status,
                              comment, assigned_at, acted_at, acted_by) VALUES
  ('WO00000000000002', 1, 1, '部门部长审批', 2, NULL, 'pending', NULL, now() - interval '2 days', NULL, NULL),
  ('WO00000000000003', 1, 1, '部门部长审批', 2, NULL, 'approved', '同意，尽快处理', now() - interval '4 days', now() - interval '3 days', 2),
  ('WO00000000000004', 1, 1, '部门部长审批', 2, NULL, 'skipped', '申请人即部长，按规则跳过', now() - interval '1 day', now() - interval '1 day', NULL),
  ('WO00000000000004', 1, 2, '超级管理员审批', 1, NULL, 'pending', NULL, now() - interval '1 day', NULL, NULL),
  ('WO00000000000005', 1, 1, '部门部长审批', 2, NULL, 'approved', '费用属实', now() - interval '5 days', now() - interval '4 days', 2),
  ('WO00000000000005', 1, 2, '财务审批', NULL, 'builtin_finance', 'pending', NULL, now() - interval '4 days', NULL, NULL),
  ('WO00000000000006', 1, 1, '部门部长审批', 2, NULL, 'approved', '同意', now() - interval '6 days', now() - interval '5 days', 2);

-- 演示日志（与工单状态一致）
INSERT INTO ticket_logs (ticket_id, action, from_status, to_status, operator_id, remark, created_at) VALUES
  ('WO00000000000002','submit','draft','pending_approval',3,NULL, now() - interval '2 days'),
  ('WO00000000000003','submit','draft','pending_approval',3,NULL, now() - interval '4 days'),
  ('WO00000000000003','approve','pending_approval','pending_assignment',2,'同意，尽快处理', now() - interval '3 days'),
  ('WO00000000000003','assign','pending_assignment','pending_acceptance',2,'指派赵敏处理', now() - interval '3 days'),
  ('WO00000000000003','accept','pending_acceptance','pending_processing',4,NULL, now() - interval '2 days'),
  ('WO00000000000003','start','pending_processing','processing',4,NULL, now() - interval '1 day'),
  ('WO00000000000004','submit','draft','pending_approval',2,NULL, now() - interval '1 day'),
  ('WO00000000000005','submit','draft','pending_approval',3,NULL, now() - interval '5 days'),
  ('WO00000000000005','approve','pending_approval','pending_approval',2,'费用属实', now() - interval '4 days'),
  ('WO00000000000006','submit','draft','pending_approval',3,NULL, now() - interval '6 days'),
  ('WO00000000000006','approve','pending_approval','pending_assignment',2,'同意', now() - interval '5 days'),
  ('WO00000000000006','assign','pending_assignment','pending_acceptance',2,'指派赵敏处理', now() - interval '5 days'),
  ('WO00000000000006','accept','pending_acceptance','pending_processing',4,NULL, now() - interval '4 days'),
  ('WO00000000000006','start','pending_processing','processing',4,NULL, now() - interval '4 days'),
  ('WO00000000000006','resolve','processing','pending_confirmation',4,'已更换新鼠标', now() - interval '3 hours'),
  ('WO00000000000006','confirm','pending_confirmation','closed',3,NULL, now() - interval '2 hours');
