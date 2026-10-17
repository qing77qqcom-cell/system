# OA 工单管理系统 · 后端开发规格文档

> 交付对象：AI 编程助手 / 后端开发者
> 依据：前端项目现状分析报告（2026-10-14），前端代码位于 `system/vue/`
> 本文档只做设计与契约定义，前端代码在本阶段不修改

## 0.1 决策记录（2026-10-14 与需求方确认，优先级高于正文冲突处）

1. **角色命名**：保留前端三名 `超级管理员 / 部长 / 普通员工`，语义映射 ChatGPT 矩阵：部长=工单管理员（授权范围=本部门）、普通员工=工单处理员
2. **新增「分配工单」**：`PATCH /api/orders/:id/assign`，超级管理员/部长（本部门）可指派 handler，普通员工可作为被指派的处理人
3. **部长对用户管理**：只读本部门用户（GET /api/users 部长返回本部门用户），增删改/启禁/重置仍为超级管理员独占
4. **普通员工数据范围**：本人提交的 + 被分配处理的工单（submitter_id = me OR handler_id = me）
5. 由此更新：§2.2 增加 assign 接口、§2.3 用户列表放宽为部长只读本部门、§3.1 role CHECK 维持三名、§8 中问题 1/2/6 视为已解决

## 0. 技术栈与总体约定

| 项 | 约定 |
|---|---|
| 运行时 | Node.js 22 LTS + Express 5 |
| 数据库 | Neon 托管 PostgreSQL（连接串带 `?sslmode=require`，pg Pool 配置 `ssl: { rejectUnauthorized: false }`） |
| 认证 | JWT（Bearer Token），bcryptjs 存密码 |
| API 风格 | REST，统一前缀 `/api` |
| 前端 | Vue 3 + Axios + ECharts（本阶段只定义契约） |
| 时区 | 服务端统一按 **Asia/Shanghai (+08:00)** 处理；pg 连接配置 `timezone: 'Asia/Shanghai'`；**所有日期时间字段在 API 中一律以 `YYYY-MM-DD HH:mm` 字符串传输**（与现有前端 `formatDateTime()` 的格式和字符串比较逻辑完全兼容） |
| 响应格式 | 成功：`HTTP 2xx` + `{ code: 0, message: 'ok', data: ... }`；失败：`HTTP 4xx/5xx` + `{ code: <业务错误码>, message: '中文错误信息' }` |
| 分页排序 | **由前端做**（已确认）。后端列表接口返回全量（按权限过滤后），不接收 page/pageSize/sort 参数 |
| 工单号 | **由后端随机生成**（已确认），见 §2.1 |

---

## 1. 后端需求规格

### 1.1 业务实体

- **用户（user）**：三种角色 = `超级管理员` / `部长` / `普通员工`（与前端 `ROLE_OPTIONS` 完全一致的中文值，前端 `ROLE_TAG_TYPE` 直接用中文做 key，不改）
- **工单（order）**：状态机 = `待处理 → 处理中 → 已完成 → 已关闭`，任一活跃态可退回为 `已退回`
- **操作日志（order_log）**：工单的每一次动作追加一条记录（前端 logs 数组渲染时间线）
- **附件（attachment）**：真实上传到服务器磁盘，工单以 JSONB 数组引用 `{name, url}`

### 1.2 权限总则（服务端强制，前端隐藏只是体验优化）

1. 所有 `/api/orders`、`/api/users`、`/api/stats`、`/api/upload` 接口必须携带有效 JWT，否则 401
2. JWT 解析后必须回查 users 表确认 `status='启用'`（禁用立即失效，无需黑名单）
3. 角色与数据范围双重校验（见 §4 权限矩阵）
4. 工单级数据权限：请求到达即判定 `该用户是否可见此工单`，不可见一律返回 404（不暴露存在性）
5. 密码策略：bcrypt 10 轮哈希；登录失败不区分"账号不存在/密码错误"，统一 401"账号或密码错误"

### 1.3 登录态约定

- `remember=true` → token 有效期 **7 天**；`false` → **1 天**（已确认 remember 要持久化，前端统一存 localStorage，后端只控制时效）
- token payload：`{ uid, username, name, role, dept, iat, exp }`
- 退出登录：前端删除本地 token 即可（无服务端黑名单，demo 规模不引入 redis，见 §8）

### 1.4 附件上传约定

- 接口：`POST /api/upload`（multipart/form-data，字段名 `file`）
- 存储：服务器 `uploads/` 目录，文件名 `Date.now()-随机串-原始文件名`，静态托管于 `/uploads/`
- 限制：单文件 ≤ 5MB；允许 jpg/png/gif/webp/pdf/doc/docx/xls/xlsx/txt；单工单前端限 5 个
- ⚠️ Render 免费实例磁盘是临时的，重启后文件丢失（demo 可接受，正式方案见 §8）

---

## 2. REST API 接口契约

通用说明：
- 需登录 = 请求头 `Authorization: Bearer <token>`
- `失败响应`一节只列差异码，通用错误见 §5.5 错误码表
- 所有列表接口返回数组（前端自己做分页/排序）

### 2.1 认证

#### POST /api/login — 登录
- 需登录：否
- 请求体：`{ username: string, password: string, remember: boolean }`
- 成功 `200`：
  ```json
  { "code": 0, "message": "ok", "data": {
      "token": "eyJhbGciOi...",
      "user": { "id": 1, "username": "admin", "name": "系统管理员", "role": "超级管理员", "dept": "技术部", "email": "admin@oa.com", "status": "启用" }
  } }
  ```
- 失败：`401` 账号或密码错误；`403` 账号已被禁用（message 区分，前端可提示"请联系管理员"）
- 校验：username/password 必填；username 存库前做 trim + toLowerCase 归一

#### GET /api/users/me — 当前用户信息
- 需登录：是；角色：任意
- 成功 `200`：`data` = 同 login 返回的 `user` 对象（不含密码）
- 用途：刷新页面后恢复用户态

### 2.2 工单

#### GET /api/orders — 工单列表
- 需登录：是；数据范围按角色自动过滤（无参数控制范围）
- Query 参数（全部可选，均与前端 `applied` 条件一一对应）：
  | 参数 | 类型 | 说明 |
  |---|---|---|
  | keyword | string | 模糊匹配 title / id |
  | dept | string | 精确匹配，取值 = DEPT_OPTIONS 之一 |
  | type | string | 精确匹配 |
  | status | string | 精确匹配 |
  | priority | string | 精确匹配 |
  | dateFrom / dateTo | string `YYYY-MM-DD` | 按 created_at 的日期部分闭区间过滤 |
- 成功 `200`：`data: Order[]`，**按 created_at 倒序**返回；Order 结构见 §3.3
- **无分页参数**（前端分页排序已确认）

#### GET /api/orders/:id — 工单详情
- 需登录：是；数据权限校验（§1.2-4）
- 成功 `200`：`data: Order`
- 失败：`404` 工单不存在或无权查看

#### POST /api/orders — 创建工单
- 需登录：是；角色：任意
- 请求体：
  ```json
  {
    "title": "≤30字", "dept": "技术部", "type": "账号权限", "priority": "中",
    "deadline": "2026-10-15 18:00",
    "description": "≥5字",
    "attachments": [{ "name": "截图.jpg", "url": "/uploads/xxx.jpg" }],
    "extra": { "account": "wangwu", "permType": "VPN权限", "applyReason": "出差" }
  }
  ```
  - `submitter` 不接收，服务端取当前登录人
  - `extra` 校验：type=账号权限 → extra.account（正则 `^[a-zA-Z0-9_.@-]+$`）与 extra.permType 必填；type=设备故障 → extra.deviceNo 与 extra.deviceType 必填（与前端动态 rules 一致）
- 服务端行为：随机生成工单号（`WO + yyyymmdd + 4位随机大写字母数字`，唯一索引冲突则重试，最多 5 次）→ status=待处理 → 写日志 `提交工单`
- 成功 `201`：`data: Order`（完整对象，前端跳详情）
- 失败：`400` 校验失败（message 指明字段）

#### PUT /api/orders/:id — 修改工单
- 需登录：是；权限：**提交人本人** 或 超级管理员（部长可否编辑本部门工单 → §8 待确认）
- 前置状态校验：仅 `待处理` / `处理中` 可编辑，否则 409
- 请求体：同创建（不含 submitter/status）
- 服务端行为：更新字段 + 追加日志 `编辑工单`
- 成功 `200`：`data: Order`

#### PATCH /api/orders/:id/status — 状态流转
- 需登录：是；按 action 校验角色
- 请求体：`{ action: 'accept' | 'reject' | 'complete' | 'close', reason?: string }`
- 状态机与权限（服务端强制）：

  | action | 允许的前置状态 | 目标状态 | 允许角色 | 附加行为 |
  |---|---|---|---|---|
  | accept | 待处理 | 处理中 | 部长 / 超级管理员 | **handler_id = 当前操作人**（接单） |
  | reject | 待处理 / 处理中 | 已退回 | 部长 / 超级管理员 | reason 必填（写日志 remark） |
  | complete | 待处理 / 处理中 | 已完成 | 部长 / 超级管理员 | 写 completed_at |
  | close | 已完成 | 已关闭 | 部长 / 超级管理员 | — |
- 成功 `200`：`data: Order`
- 失败：`409` 当前状态不允许该操作；`403` 角色不允许；`400` reject 缺 reason
- 说明：`accept` 为新增建议——前端日志文案已有"已接单"，且 handler 字段除种子数据外无人写入，此接口补上该缺口（前端需配按钮，见 §7）

#### POST /api/orders/batch-close — 批量关闭
- 需登录：是；角色：超级管理员 / 部长（部长仅本部门工单生效）
- 请求体：`{ ids: string[] }`（≤100 个）
- 服务端行为：对每个 id 校验状态 ∈ {待处理, 处理中} 且数据权限通过 → 置为已关闭 + 日志 `批量关闭工单`
- 成功 `200`：`data: { count: number }`（**实际关闭数**，与前端提示文案一致）
- 失败：`400` ids 为空或超限

#### DELETE /api/orders/:id — 删除工单（软删除）
- 需登录：是；角色：**仅超级管理员**（前端目前人人可删，需前端配合收按钮，见 §7）
- 服务端行为：`deleted_at = now()`（列表/详情/统计均排除已删除）
- 成功 `200`：`data: { id }`
- 选软删除理由：工单是审计数据，统计与日志依赖历史；对前端表现与物理删除一致

#### POST /api/orders/:id/urge — 催办
- 需登录：是；权限：**提交人本人** 或 部长（本部门） / 超级管理员
- 前置状态：待处理 / 处理中，否则 409
- 服务端行为：追加日志 `{ action: '催办', remark: '请尽快处理该工单，谢谢！' }`（与现前端文案一致）
- 成功 `200`：`data: Order`

### 2.3 用户管理（菜单/接口仅超级管理员可见可用）

#### GET /api/users — 用户列表
- 角色：超级管理员；无分页参数
- 成功 `200`：`data: User[]`（按 created_at 升序；User 结构见 §3.2，**绝不含 password/password_hash**）

#### POST /api/users — 创建用户
- 请求体：`{ username, name, role, dept, email, password? }`
- 服务端行为：username 唯一（冲突 409）；password 缺省 `123456`；status=启用；created_at=now
- 成功 `201`：`data: User`

#### PUT /api/users/:id — 修改用户
- 可改字段：`name / role / dept / email`（username 不可改，前端编辑弹窗已禁用）
- 成功 `200`：`data: User`

#### PATCH /api/users/:id/status — 启用/禁用
- 请求体：`{ status: '启用' | '禁用' }`
- 语义：禁用后该用户登录返回 403，且其已发 token 因 §1.2-2 的回查立即失效
- 成功 `200`：`data: User`

#### PATCH /api/users/:id/password — 重置密码
- 服务端行为：密码重置为 `123456`（与前端提示文案一致）
- 成功 `200`：`data: { id }`

#### DELETE /api/users/:id — 删除用户
- 前置校验：该用户名下存在工单（submitter_id 或 handler_id 引用）→ `409`"该用户存在工单记录，请使用禁用功能"
- 成功 `200`：`data: { id }`

### 2.4 统计（图表数据）

> 口径详见 §5。统计范围按角色自动限定，接口不接收范围参数。

#### GET /api/stats/overview — 首页指标 + 状态分布
- 成功 `200`：
  ```json
  { "code": 0, "data": {
      "total": 12, "pending": 3, "processing": 4, "completed": 2,
      "closed": 2, "returned": 1, "overdue": 1, "monthDone": 2,
      "avgProcessHours": 6.5
  } }
  ```
- 前端饼图直接消费 pending/processing/overdue/monthDone 四项（与现有 Workbench 图完全对齐）；closed/completed 供后续图表；**不单独设"状态分布"接口**（本接口已含全部 5 个状态计数，评估后判定冗余）

#### GET /api/stats/trend?days=7 — 工单趋势
- Query：`days` ∈ {7, 30}，默认 7
- 成功 `200`：`data: [{ date: '2026-10-08', created: 2, completed: 1 }, ...]`（**逐日补零**，date 为 Asia/Shanghai 日期）
- 用途：工作台新增"近 7 天新增/完成趋势"折线图（配合 JD 数据可视化要求，字段已具备）

#### GET /api/stats/workload — 处理人工作量
- 角色：部长 / 超级管理员（普通员工 403）
- 成功 `200`：`data: [{ handlerId: 3, handlerName: '李四', processing: 2, completed: 5, avgProcessHours: 4.2 }]`（只统计 handler_id 非空的工单）

### 2.5 附件与健康检查

#### POST /api/upload — 上传附件
- 需登录：是；角色：任意；`multipart/form-data`，字段 `file`
- 成功 `201`：`data: { name: '错误提示截图.jpg', url: '/uploads/1728-abc-错误提示截图.jpg' }`
- 失败：`400` 类型不允许；`413` 超过 5MB

#### GET /api/health — 健康检查
- 需登录：否
- 成功 `200`：`{ status: 'ok', db: 'up' }`（db 项执行 `SELECT 1` 判定；部署平台探活用）

---

## 3. 数据库设计（Neon PostgreSQL）

### 3.1 表结构

#### users — 用户表
| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | SERIAL | **PK** | |
| username | VARCHAR(50) | **UNIQUE NOT NULL** | 登录账号（存小写） |
| password_hash | VARCHAR(100) | NOT NULL | bcrypt 哈希 |
| name | VARCHAR(50) | NOT NULL | 姓名 |
| role | VARCHAR(10) | NOT NULL CHECK (role IN ('超级管理员','部长','普通员工')) | 中文值与前端一致 |
| dept | VARCHAR(10) | NULL CHECK (dept IN ('技术部','市场部','财务部','人事部','行政部')) | 可为空：超级管理员不属于任何部门；部长按 dept 过滤列表时天然不含 admin |
| email | VARCHAR(100) | NOT NULL | 唯一性 → §8 待确认 |
| status | VARCHAR(4) | NOT NULL DEFAULT '启用' CHECK (status IN ('启用','禁用')) | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

索引：`idx_users_role`、`idx_users_dept`

#### orders — 工单表
| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | VARCHAR(14) | **PK** | `WO+yyyymmdd+4位随机`，服务端生成 |
| title | VARCHAR(50) | NOT NULL | 前端校验 ≤30 字 |
| type | VARCHAR(10) | NOT NULL CHECK (type IN ('账号权限','设备故障','网络异常','系统BUG','其他需求')) | |
| dept | VARCHAR(10) | NOT NULL | 工单归属部门（前端表单选择） |
| priority | VARCHAR(2) | NOT NULL CHECK (priority IN ('高','中','低')) | |
| status | VARCHAR(6) | NOT NULL DEFAULT '待处理' CHECK (status IN ('待处理','处理中','已完成','已关闭','已退回')) | |
| submitter_id | INT | **FK → users.id ON DELETE RESTRICT** NOT NULL | 创建人 |
| handler_id | INT | **FK → users.id ON DELETE RESTRICT** NULL | 处理人（接单后写入） |
| deadline | TIMESTAMPTZ | NULL | |
| completed_at | TIMESTAMPTZ | NULL | |
| description | TEXT | NOT NULL | |
| extra | JSONB | NOT NULL DEFAULT '{}' | 动态字段 |
| attachments | JSONB | NOT NULL DEFAULT '[]' | `[{name,url}]` |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | 编辑时更新（前端建议字段，见 §7） |
| deleted_at | TIMESTAMPTZ | NULL | 软删除标记 |

索引：`idx_orders_status`、`idx_orders_dept`、`idx_orders_submitter`、`idx_orders_handler`、`idx_orders_created_at`、`idx_orders_type`、`idx_orders_priority`

#### order_logs — 工单操作日志
| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | SERIAL | **PK** | |
| order_id | VARCHAR(14) | **FK → orders.id ON DELETE CASCADE** NOT NULL | |
| user_id | INT | FK → users.id ON DELETE RESTRICT NOT NULL | 操作人 |
| action | VARCHAR(20) | NOT NULL | 提交工单/编辑工单/已接单/催办/退回工单/完成工单/关闭工单/批量关闭工单 |
| remark | TEXT | NULL | 退回原因等 |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

索引：`idx_logs_order`

### 3.2 ER 关系

```
users 1 ────< orders >──── 1 users          （submitter_id 提交人 / handler_id 处理人，两个独立 FK）
users 1 ────< order_logs >─── 1 orders      （日志随工单级联删除）
```
- 一名用户可提交/处理多张工单；一张工单必有 1 个提交人、至多 1 个处理人
- 用户删除受 RESTRICT 保护：有工单记录的用户不可物理删除，只能禁用（接口层已兜底 409）
- 角色与部门不单独建表：均为固定枚举（前端常量），避免过度设计；后端以 CHECK 约束守住取值

### 3.3 API 返回结构（序列化规则）

时间字段一律 `YYYY-MM-DD HH:mm`（Asia/Shanghai）字符串。**关联对象内联**，与前端现有字段名对齐：

```jsonc
// Order（列表与详情同构，详情多 logs）
{
  "id": "WO20261013A7K2",
  "title": "OA 登录提示账号被锁定",
  "type": "系统BUG", "dept": "技术部", "priority": "高", "status": "处理中",
  "submitter": "张三",            // submitter_id → users.name 内联（前端所有页面只用姓名字符串）
  "handler": "李四",              // handler_id → users.name，可为 null
  "createdAt": "2026-09-28 10:12",
  "deadline": "2026-09-29 18:00",
  "completedAt": null,
  "description": "...",
  "attachments": [{ "name": "错误提示截图.jpg", "url": "/uploads/..." }],
  "extra": {},
  "logs": [{ "user": "张三", "time": "2026-09-28 10:12", "action": "提交工单" }]
}

// User
{ "id": 1, "username": "admin", "name": "系统管理员", "role": "超级管理员",
  "dept": "技术部", "email": "admin@oa.com", "status": "启用", "createdAt": "2026-01-01 09:00" }
```

字段命名（camelCase）与前端现有对象完全一致，前端 store 无需改字段名。

---

## 4. 角色权限矩阵

> 菜单/按钮的显隐属于前端配合项（§7），**本表全部规则必须由服务端实现**。

| 能力 | 超级管理员 | 部长 | 普通员工 |
|---|:---:|:---:|:---:|
| 登录、获取当前用户、上传附件 | ✅ | ✅ | ✅ |
| 创建工单、催办（本人单） | ✅ | ✅ | ✅ |
| 工单可见范围 | 全部 | 本部门 | 仅本人提交的 |
| 编辑工单 | 全部 | 本部门（待确认 §8） | 仅本人、且待处理/处理中 |
| 接单 accept | ✅ | ✅ 本部门 | ❌ |
| 退回 reject / 完成 complete / 关闭 close | ✅ | ✅ 本部门 | ❌ |
| 批量关闭 | 全部 | 本部门 | ❌ |
| 删除工单 | ✅ | ❌ | ❌ |
| 用户管理（列表/增改/启禁/重置/删除） | ✅ | ❌ | ❌ |
| stats/overview、stats/trend | 全局 | 本部门 | 仅本人数据 |
| stats/workload | 全局 | 本部门 | ❌ 403 |

前端现状与矩阵的差异标注：
- 前端目前**无任何数据权限**（人人看全部）→ 接口上线后普通员工列表自动只看到自己的单子，前端列表代码无需改动
- 前端目前**人人可删工单、人人可完成/退回** → 需前端按角色收按钮（§7）
- "部长"的定位 = 处理员（接单、推进状态），依据：种子数据中 handler 李四 role=部长；普通员工不设为处理人。**此业务规则为建议项，待确认**

---

## 5. 图表统计口径说明

> 通用口径：timezone = Asia/Shanghai；范围按角色（admin 全局 / 部长本部门 / 员工本人提交的）；软删除的不计入；空数据返回 0 或空数组而非 404。

| 指标 | SQL 口径 |
|---|---|
| total | COUNT(*) 全部未删除工单 |
| pending / processing / completed / closed / returned | 按 status 精确计数 |
| overdue | status IN (待处理,处理中) AND deadline < now() AND deadline IS NOT NULL（与前端 `isOverdue()` 一致） |
| monthDone | status='已完成' AND completed_at 在本月（Asia/Shanghai 自然月） |
| avgProcessHours | AVG(completed_at - created_at)，仅 completed_at 非空；保留 1 位小数；无样本返回 0 |
| trend | 按 created_at::date 与 completed_at::date 分别逐日计数，缺失日补 0，date 升序 |
| workload | 按 handler_id 分组：processing=处理中数、completed=已完成数、avgProcessHours 同上 |

**全局 vs 个人**：接口不区分端点，由角色决定范围；前端工作台对普通员工展示的即为"我的统计"。

**时区**：pg Pool 配置 `timezone: 'Asia/Shanghai'`，避免 UTC 偏移导致月度/逐日统计跨界错误。

---

## 6. 工程与部署

### 6.1 目录结构（server/）

```
server/
├── app.js                  # 入口：express 实例、中间件挂载、路由注册、启动
├── src/
│   ├── config.js           # 读取环境变量并集中导出（缺关键变量直接抛错退出）
│   ├── db.js               # pg Pool（ssl、timezone 配置）+ query 封装
│   ├── middleware/auth.js  # requireAuth：解析 JWT + 回查用户状态；requireRole(...roles)
│   ├── middleware/error.js # 404 兜底 + 统一错误处理中间件
│   ├── routes/             # auth.js / orders.js / users.js / stats.js / upload.js
│   ├── services/           # 业务逻辑与 SQL（路由层不做 SQL 拼接）
│   ├── utils/validate.js   # 手写校验函数（零额外依赖）
│   └── utils/orderId.js    # 随机工单号生成（冲突重试）
├── sql/init.sql            # 建表 + 索引（幂等：IF NOT EXISTS）
├── scripts/seed.js         # 演示账号与种子数据初始化（可重复执行）
├── uploads/                # 附件目录（gitignore）
├── .env                    # 本地环境变量（gitignore）
├── .gitignore
└── package.json
```

### 6.2 环境变量清单（全部走 .env / 部署平台面板，**禁止入库入仓**）

| 变量 | 示例 | 说明 |
|---|---|---|
| DATABASE_URL | postgresql://...neon.tech/neondb?sslmode=require | Neon 连接串 |
| JWT_SECRET | ≥32 位随机串 | `openssl rand -hex 32` 生成 |
| JWT_EXPIRES | 1d | remember=false 时的有效期 |
| JWT_EXPIRES_REMEMBER | 7d | remember=true 时的有效期 |
| PORT | 3000 | |
| NODE_ENV | development / production | |
| CORS_ORIGIN | http://localhost:5173 | 逗号分隔多个来源 |
| UPLOAD_DIR | uploads | 相对 server 根目录 |

### 6.3 数据库初始化与演示账号

1. `sql/init.sql`：CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS（幂等，可重复执行）
2. `node scripts/seed.js`：表为空时插入 3 个演示账号（bcrypt 加密后入库）+ 8 个补充用户（对应前端 SEED_USERS 的其余姓名，保证工单提交人联动）+ SEED_ORDERS 全部 10 条种子工单及其日志；**已有数据时跳过**（幂等）
3. 演示账号：`admin / manager / staff`，密码统一 `123456`；manager 绑定技术部·部长，staff 绑定技术部·普通员工

### 6.4 中间件与工程约定

- **错误处理**：统一错误中间件捕获；业务错误用 `class ApiError extends Error { code, status }` 抛出；未捕获错误返回 500 且**不泄漏堆栈给客户端**（服务端打印）
- **参数校验**：集中在 `utils/validate.js`（必填/长度/枚举/正则/日期格式），路由层调用；枚举校验取值必须与 §3.1 CHECK 约束一致
- **日志**：morgan（dev 格式）输出请求日志；错误日志带时间戳与堆栈打到 stdout（Render 面板可见）
- **CORS**：`cors({ origin: CORS_ORIGIN.split(','), credentials: false })`；生产只放行前端部署域名
- **静态资源**：`app.use('/uploads', express.static(UPLOAD_DIR))`
- **健康检查**：`GET /api/health`（含 db 探活）
- **启动**：开发 `npm run dev`（nodemon）；生产 `npm start`（node app.js）；Render 部署：Build 留空 / Start `node app.js`，环境变量面板配置，Neon 连接串必须带 sslmode=require

---

## 7. 前端需要配合的调整（仅列出建议，本阶段不改）

1. **新增请求层** `src/api/`：axios 实例（baseURL `/api`，请求拦截器带 token，响应拦截器统一拆 `data.data`、401 时清 token 跳登录）
2. **登录改造**：对接 POST /api/login；`localStorage.oa_token` 存 `{token, user}`（remember 持久化策略：无论勾选与否均存 localStorage，remember 只影响后端 token 时效）；`helpers.currentUser()` 改为从 user 对象读取（含 role，供权限判断）
3. **路由守卫扩展**：routes meta 加 `roles`，beforeEach 校验 role；`/usercontrol` 仅超级管理员
4. **菜单/按钮显隐**（Layout.vue 与各页面）：用户管理菜单 → 超级管理员；删除工单/批量关闭 → 超级管理员（部长限本部门）；接单/退回/完成/关闭按钮 → 部长与超级管理员；催办 → 提交人本人或管理员；普通员工详情页只留 催办/编辑(本人)
5. **store 改造**：两个 store 的 setTimeout 假请求换成真实 api 调用，删除 persist()；工单号不再前端生成（genOrderId 退役）
6. **详情页新增"接单"按钮**（部长/管理员、待处理状态可见）
7. **字段对齐**：Order 增加 `updatedAt` 可选展示；其余字段名无需变更
8. **图表扩展**（可选，配合 stats/trend 与 workload）：工作台增加趋势折线图、部门工作量柱状图，复用 BaseChart.vue

---

## 8. 尚未确定的问题（实施前需拍板）

| # | 问题 | 当前文档采取的默认方案 |
|---|---|---|
| 1 | 部长能否编辑本部门工单（非本人提交） | 默认可（矩阵中标注待确认） |
| 2 | 普通员工是否允许被设为处理人 | 默认否（接单仅部长/管理员） |
| 3 | 用户 email 是否唯一 | 默认不唯一（前端也只校验格式） |
| 4 | 附件在 Render 免费实例重启后会丢失 | demo 接受；正式方案建议 Neon + 云对象存储或升级实例磁盘 |
| 5 | 退出登录是否需要服务端 token 失效（黑名单） | 默认不做，靠"禁用即时回查 + 短有效期"兜底 |
| 6 | 工单 dept 是否必须等于提交人所在部门 | 默认不强制（前端表单自由选择，与现状一致） |
| 7 | trend/workload 图表是否本期上线 | 接口本期实现，前端图表排期另定 |
| 8 | 删除用户时其历史工单的展示 | 默认 RESTRICT 禁止删除有单用户，只允许禁用 |

---

## 9. 测试验收标准

> 每条以"操作 → 期望"表达；实施完成后逐条自测并在交付说明中勾选。

### 9.1 认证
- [ ] T01 正确账号密码登录 → 200，返回 token + user，role/dept 正确
- [ ] T02 错误密码 → 401，message="账号或密码错误"（不提示具体哪个错）
- [ ] T03 不存在的账号 → 401，同 T02 文案
- [ ] T04 禁用账号登录 → 403"账号已被禁用"
- [ ] T05 remember=true → 返回 token 过期时间 ≈ 7 天；false → ≈ 1 天
- [ ] T06 缺 username/password → 400

### 9.2 访问控制
- [ ] T07 无 token 访问 /api/orders → 401
- [ ] T08 伪造/过期 token → 401
- [ ] T09 普通员工访问 /api/users → 403
- [ ] T10 普通员工访问 /api/stats/workload → 403
- [ ] T11 禁用用户已有 token 调任意接口 → 401（回查生效）

### 9.3 工单 CRUD 与状态机
- [ ] T12 创建工单合法数据 → 201，id 符合 WO+日期+4 位随机、status=待处理、submitter=当前人、logs 含"提交工单"
- [ ] T13 title>30字 / description<5字 / 非法枚举 → 400
- [ ] T14 账号权限类型缺 extra.account → 400；设备故障缺 extra.deviceNo → 400
- [ ] T15 普通员工 GET /api/orders → 仅返回本人提交的工单
- [ ] T16 部长 GET /api/orders?dept=技术部 → 仅技术部；不带 dept → 仅本部门
- [ ] T17 管理员 GET /api/orders → 全部
- [ ] T18 员工访问他人工单详情 → 404；部长访问跨部门工单 → 404
- [ ] T19 员工编辑本人待处理工单 → 200，logs 追加"编辑工单"，updated_at 变化
- [ ] T20 编辑已完成工单 → 409
- [ ] T21 部长 accept 待处理单 → 200，status=处理中，handler=部长本人
- [ ] T22 员工调 accept → 403
- [ ] T23 reject 缺 reason → 400；带 reason → 已退回，日志含 remark
- [ ] T24 complete → completed_at 写入且为 +08:00 当前时间
- [ ] T25 已关闭单再 complete → 409（状态机非法迁移）
- [ ] T26 batch-close 混合状态 ids → count 只含待处理/处理中
- [ ] T27 员工 DELETE 工单 → 403；管理员删除 → 列表不再出现（软删）
- [ ] T28 员工催办本人单 → 200；催办他人单 → 404

### 9.4 用户管理
- [ ] T29 创建重复 username → 409
- [ ] T30 新用户缺省密码 123456 可直接登录
- [ ] T31 PATCH status=禁用后该用户登录 → 403
- [ ] T32 删除有工单的用户 → 409；删除无工单用户 → 200

### 9.5 统计与图表
- [ ] T33 overview 各计数与手工 SQL 一致；overdue 口径符合 §5
- [ ] T34 空库/无数据 → overview 全 0、trend 补零数组、workload 空数组（不报错）
- [ ] T35 员工请求 overview → 数据仅含本人工单统计
- [ ] T36 trend days=7 → 返回恰好 7 条且日期连续
- [ ] T37 avgProcessHours = completed_at-createdAt 均值（抽查一条手算）

### 9.6 附件与健壮性
- [ ] T38 上传合法文件 → 201 返回 url，GET url 可访问
- [ ] T39 上传 .exe → 400；>5MB → 413
- [ ] T40 手工断开数据库（改错连接串）→ /api/health 返回 db:down，业务接口 500 且 message 不含连接串
- [ ] T41 查询参数注入 SQL 片段（如 keyword=`' OR 1=1--`）→ 被参数化查询拦截，返回空/无匹配
- [ ] T42 Neon 冷启动后首个请求自动恢复（连接池重试）→ 2 次内成功

---

## 附：接口与前端字段对照自查表

| 前端现有字段/文案 | 后端契约来源 | 一致性 |
|---|---|---|
| STATUS_OPTIONS 5 个中文状态 | orders.status CHECK | ✅ 完全一致 |
| PRIORITY/TYPE/DEPT_OPTIONS | 各列 CHECK 约束 | ✅ |
| logs {user,time,action,remark} | order_logs 序列化 | ✅ |
| ROLE_OPTIONS 3 角色 | users.role CHECK | ✅ |
| 批量关闭返回"已关闭 N 条" | batch-close data.count | ✅ |
| 重置密码文案"123456" | reset-password 固定值 | ✅ |
| 催办 remark 文案 | urge 固定 remark | ✅ |
| 日期格式 YYYY-MM-DD HH:mm | 序列化规则 §2 | ✅ |
| isOverdue 字符串比较 | deadline 返回同格式字符串 | ✅ 可继续用字符串比较 |
| 前端分页/排序 computed | 列表接口无分页参数 | ✅ 保持前端实现 |
