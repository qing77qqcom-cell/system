# OA 工单系统 · 动态表单 Schema 规范

> **归属**：前端引擎契约文档
> **版本**：v1.0（v2.0 扩展规划见末尾）
> **后端表**：`form_field_configs` + `role_permissions`
> **前端组件**：`DynamicField.vue` + `DynamicForm.vue`
> **最后更新**：2026-10-27

---

## 1. 这是什么

后端 `form_field_configs` 表存了一堆字段配置（每个工单类型有哪些自定义字段、叫什么、是什么组件、要不要必填）。前端**通用渲染引擎**读这些配置，自动拼出 `<el-form>` — **前端代码一行不变，后端改一行 schema，表单就跟着变**。

```
┌─────────────┐    GET /api/form-configs?ticket_type=xxx    ┌─────────────┐
│  PostgreSQL │ ─────────────────────────────────────────→ │   前端引擎    │
│ form_field  │                                            │ DynamicForm  │
│   _configs  │  返回 [{fieldKey, label, fieldType, ...}]  │ DynamicField │
└─────────────┘                                            └──────┬──────┘
                                                                  │
                                                    <el-form-item v-for="f in fields">
                                                                  │
                                                    根据 f.fieldType 渲染 el-input / el-select ...
```

---

## 2. 后端枚举与表结构（v1.0）

### 2.1 全量枚举定义（init.sql CREATE TYPE / sys_dictionaries）

#### ticket_type（3 种工单类型 · ENUM）

| 值 | 中文 | 用途 |
|---|---|---|
| `fault_repair` | 故障报修 | 硬件/软件/网络故障 |
| `account_permission` | 账号与权限服务 | OA/邮箱/VPN/ERP 权限申请 |
| `reimbursement` | 报销审批 | 办公用品/差旅费/招待费报销 |

#### ticket_status（10 种工单状态 · ENUM）

| 值 | 中文 | 阶段 |
|---|---|---|
| `draft` | 草稿 | 提交前 |
| `pending_approval` | 待审批 | 一级审批 |
| `pending_assignment` | 待分配 | 审批通过后等指派 |
| `pending_acceptance` | 待接单 | 已指派，等处理人接单 |
| `pending_processing` | 待处理 | 已接单，等开始处理 |
| `processing` | 处理中 | 处理人正在处理 |
| `pending_confirmation` | 待确认 | 处理完成，等申请人确认 |
| `pending_completion` | 待完成 | 确认后等关闭 |
| `closed` | 已关闭 | 终态 |
| `cancelled` | 已取消 | 终态 |

#### ticket_action（20 种工单动作 · ENUM）

```
submit / approve / reject_approval / assign / reassign / accept /
transfer / start / resolve / confirm / supplement / suspend /
resume / cancel / close / reopen / escalate / change_priority /
sla_exempt / mark_paid
```

→ 后端 `POST /api/tickets/:id/actions { action: 'xxx' }` 的合法值

#### priority（4 种优先级 · sys_dictionaries）

| 值 | 中文 |
|---|---|
| `low` | 低 |
| `medium` | 中 |
| `high` | 高 |
| `urgent` | 紧急 |

---

### 2.2 form_field_configs 表结构

| 列 | 类型 | 约束 | 前端语义 |
|---|---|---|---|
| id | serial | PK | 仅作 `v-for :key`，不参与业务 |
| ticket_type | ticket_type | NOT NULL | 工单类型枚举，决定"谁的字段" |
| field_key | varchar(50) | NOT NULL, UNIQUE(ticket_type, field_key) | 唯一标识 → 绑定到 `form.extra[fieldKey]` |
| label | varchar(50) | NOT NULL | el-form-item 的 label 文本 |
| field_type | varchar(20) | CHECK IN(text,textarea,number,select,date) | 渲染哪种组件 |
| required | boolean | DEFAULT false | 是否必填 → 自动生成校验 |
| options | jsonb | nullable | select 专用 → 选项列表 |
| sort | smallint | DEFAULT 0 | 同类型下的渲染顺序，升序 |
| active | boolean | DEFAULT true | 是否启用（admin 可下线） |

### 2.2 fieldType → Element Plus 组件映射

| fieldType | 组件 | props | 备注 |
|---|---|---|---|
| `text` | `<el-input>` | `clearable: true`, `placeholder: '请输入{label}'` | 单行文本 |
| `textarea` | `<el-input type="textarea">` | `rows: 3`, `placeholder: '请输入{label}'` | 多行文本 |
| `number` | `<el-input-number>` | `controls-position: 'right'` | 数字输入器 |
| `select` | `<el-select>` | `style: 'width:100%'` | 下拉选择，子节点 `<el-option>` |
| `date` | `<el-date-picker type="date">` | `style: 'width:100%'` | 日期选择 |

### 2.3 options 格式兼容

后端当前存 **纯字符串数组**：
```sql
INSERT INTO form_field_configs ... options='["OA","邮箱","VPN","ERP"]'
```

前端 `DynamicField.normalizedOptions` 自动归一化：
```js
["OA", "邮箱"]                         // 纯字符串 → [{label:"OA", value:"OA"}, ...]
[{label: "办公网", value: "oa"}]       // 对象数组 → 原样返回
```

---

## 3. DynamicForm 行为规范

### 3.1 Props

| Prop | 类型 | 说明 |
|---|---|---|
| `ticketType` | String | 必填。当前工单类型，watch 它触发重新拉 schema |
| `model` | Object | 必填。就是外层 WorkOrderForm 的 `form.extra`，直接双向绑定 |
| `readonlyFields` | Array | 默认 `[]`。哪些 fieldKey 只读 → `el-input :disabled` |

### 3.2 Events

| Event | Payload | 说明 |
|---|---|---|
| `rules-change` | `Record<string, Rule[]>` | DynamicForm 根据 schema 生成的校验规则，向外 emit 给外层合并 |

### 3.3 Watch 行为

```
ticketType 变化
    ↓
listFormConfigs(ticketType) 重新调接口
    ↓
fields.value 整体替换
    ↓
旧的 form.extra 脏数据由父组件 handleTypeChange() 清空
    ↓
rules computed 跟着变化 → emit('rules-change', newRules)
```

### 3.4 校验规则自动生成

```js
// DynamicForm 内部 computed
const dynRules = computed(() => {
  const r = {}
  for (const f of fields.value) {
    const key = `extra.${f.fieldKey}`   // ← 关键：prop 路径要和外层 el-form 的嵌套 model 一致
    const arr = []
    if (f.required)   arr.push({ required: true, message: `请填写${f.label}`, trigger: 'blur' })
    if (f.fieldType === 'number') arr.push({ type: 'number', message: `${f.label}必须是数字`, trigger: 'blur' })
    r[key] = arr
  }
  return r
})
emit('rules-change', r)
```

### 3.5 WorkOrderForm 侧的规则合并

```vue
<!-- WorkOrderForm.vue -->
<DynamicForm
  :ticket-type="form.type"
  :model="form.extra"
  :readonly-fields="readonlyExtraFields"
  @rules-change="dynRules = $event"
/>
```

```js
// WorkOrderForm.vue script
const dynRules = ref({})
const mergedRules = computed(() => ({ ...baseRules.value, ...dynRules.value }))

// el-form 用 mergedRules
<el-form :rules="mergedRules" ...>
```

---

## 4. 权限码规范（role_permissions · 46 条全量）

### 4.1 四层权限前缀

| 前缀 | 总条数 | 用途 | 前端消费位置 |
|---|---|---|---|
| `menu:*` | 6 | 菜单级显隐 | Layout.vue `visibleNavs`、动态路由 `router.addRoute` |
| `action:*` | 20 | 按钮级显隐（与 ticket_action 枚举一一对应） | WorkOrderDetail.vue 操作按钮 |
| `stats:*` | 1 | 功能级限制（导出） | datalist.vue 报表导出按钮 |
| `field:readonly:*` | 4 | **字段级只读** | DynamicForm → `readonlyFields` → DynamicField `:disabled` |

### 4.2 menu:\* 全量（6 条）

| perm_code | 含义 | admin | leader | staff |
|---|---|---|---|---|
| `menu:workbench` | 工作台 | ✅ | ✅ | ✅ |
| `menu:tickets` | 工单列表/创建 | ✅ | ✅ | ✅ |
| `menu:stats` | 数据分析子路由 | ✅ | ✅ | ✅ |
| `menu:system-config` | 系统设置一级菜单 | ✅ | ❌ | ❌ |
| `menu:user-manage` | 用户/角色/组织/账号安全 | ✅ | ❌ | ❌ |
| `menu:logs` | 操作日志 | ✅ | ❌ | ❌ |

### 4.3 action:\* 全量（20 条，按角色能力分层）

| 分组 | perm_code | admin | leader | staff |
|---|---|---|---|---|
| **全员基础** | `action:submit`, `action:supplement`, `action:cancel`, `action:confirm`, `action:reopen` | ✅ | ✅ | ✅ |
| **审批链路** | `action:approve`, `action:reject_approval` | ✅ | ✅ | ❌ |
| **指派链路** | `action:assign`, `action:reassign`, `action:transfer` | ✅ | ✅ | ❌ |
| **调度链路** | `action:suspend`, `action:resume`, `action:escalate`, `action:change_priority`, `action:sla_exempt` | ✅ | ✅ | ❌ |
| **处理人链路** | `action:accept`, `action:start`, `action:resolve` | ✅（兜底） | ❌ | ✅ |
| **仅超管** | `action:mark_paid` | ✅ | ❌ | ❌ |

非 action: 前缀：`stats:export`（仅 admin）

### 4.4 field:readonly:\*（4 条示例，init.sql 第 392-396 行已预置）

| 角色 | 权限码 | 业务含义 |
|---|---|---|
| 技术部普通员工 | `field:readonly:permType` | 账号权限工单的"权限类型"由审批确定，提交时只读 |
| 技术部普通员工 | `field:readonly:deviceNo` | 故障报修的"设备编号"由超管分配，提交时只读 |
| 技术部部长 | `field:readonly:amount` | 报销审批时只读申请人填的金额 |
| 技术部部长 | `field:readonly:subject` | 报销审批时只读申请人填的科目 |

> **v2.0 规划**：当前是"角色全局只读"（leader 对所有人的报销单都只读 amount/subject）。更精准的语义应该是"leader 在审批阶段只读，但查看自己的报销单时可编辑"。这需要前端条件求值器 `readonly_when` + 后端字段级校验兜底。

### 4.5 完整权限矩阵（按 init.sql 46 条反推）

```
技术部普通员工（14 条）:
  menu:workbench, menu:tickets, menu:stats
  action:submit, action:supplement, action:cancel, action:confirm, action:reopen,
  action:accept, action:start, action:resolve
  field:readonly:deviceNo, field:readonly:permType

技术部部长（18 条）:
  menu:workbench, menu:tickets, menu:stats
  action:submit, action:supplement, action:cancel, action:confirm, action:reopen,
  action:approve, action:reject_approval,
  action:assign, action:reassign, action:transfer,
  action:suspend, action:resume, action:escalate, action:change_priority, action:sla_exempt
  field:readonly:amount, field:readonly:subject

超级管理员（31 条）:
  menu:workbench, menu:tickets, menu:stats, menu:system-config, menu:user-manage, menu:logs
  action: 上述 18 条 + action:accept, action:start, action:resolve, action:mark_paid
  stats:export
  (无 field:readonly — admin 全字段可编辑)
```

---

## 5. 种子数据（init.sql · 已全部补齐）

form_field_configs 共 **7 条**，覆盖全部 3 种工单类型：

```sql
-- 报销类型（reimbursement）
('reimbursement','amount','报销金额（元）','number',true,NULL,1),
('reimbursement','subject','报销科目','select',true,'["办公用品","差旅费","招待费","其他"]',2),

-- 账号权限类型（account_permission）
('account_permission','system','目标系统','select',true,'["OA","邮箱","VPN","ERP"]',1),
('account_permission','permType','权限类型','select',true,'["新增","变更","注销"]',2),

-- 故障报修（fault_repair）· 前端 DynamicForm 联动测试用
('fault_repair','deviceNo','设备编号','text',true,NULL,1),
('fault_repair','deviceType','设备类型','select',true,'["电脑","打印机","服务器","路由器"]',2),
('fault_repair','faultDesc','故障描述','textarea',false,NULL,3);
```

role_permissions 已包含 **field:readonly:\*** 示例（init.sql 第 390-396 行）：

```sql
('技术部普通员工','field:readonly:permType'),   -- 账号权限工单的"权限类型"对员工只读
('技术部普通员工','field:readonly:deviceNo'),  -- 故障报修的"设备编号"对员工只读
('技术部部长','field:readonly:amount'),         -- 报销审批时部长只读金额
('技术部部长','field:readonly:subject');        -- 报销审批时部长只读科目
```

---

## 6. 扩展规划（v2.0 · 后端需加列）

> **核心观点**：前端先定义语义规范，后端按规范加列。不是后端加列前端瞎消费，而是前端要什么后端才加什么。

### 6.1 新增字段

| 列 | 类型 | 优先级 | 前端用途 |
|---|---|---|---|
| `placeholder` | varchar(100) nullable | 低 | 自定义占位符，覆盖默认的 `请输入{label}` |
| `default_value` | jsonb nullable | 中 | 切换工单类型时自动给字段赋初值 |
| `min_length` | integer nullable | 低 | 自动加 `min` 校验 |
| `max_length` | integer nullable | 低 | 自动加 `max` 校验 / `show-word-limit maxlength` |
| `visible_when` | jsonb nullable | **高** | 字段联动显示条件（见下文） |
| `readonly_when` | jsonb nullable | 高 | 条件式只读（role_permissions 是角色级，这个是数据级） |

### 6.2 visible_when 条件求值器

```js
// utils/conditionEval.js — 前端自研
export function evalCondition(condition, formData) {
  if (!condition) return true

  // 单字段单值
  if (condition.eq !== undefined)  return formData[condition.fieldKey] === condition.eq
  if (condition.ne !== undefined)  return formData[condition.fieldKey] !== condition.ne
  if (condition.gt !== undefined)  return Number(formData[condition.fieldKey]) >  condition.gt
  if (condition.gte !== undefined) return Number(formData[condition.fieldKey]) >= condition.gte
  if (condition.lt !== undefined)  return Number(formData[condition.fieldKey]) <  condition.lt
  if (condition.lte !== undefined) return Number(formData[condition.fieldKey]) <= condition.lte

  // 单字段多值
  if (condition.in !== undefined)    return condition.in.includes(formData[condition.fieldKey])
  if (condition.notIn !== undefined) return !condition.notIn.includes(formData[condition.fieldKey])

  // 组合条件
  if (condition.and) return condition.and.every(c => evalCondition(c, formData))
  if (condition.or)  return condition.or.some(c => evalCondition(c, formData))

  return true
}
```

### 6.3 visible_when 存储示例

```json
// 只有 deviceType=server 时才显示 serverAddress
{ "fieldKey": "deviceType", "eq": "server" }

// 只有高优先级工单才显示 SLA 豁免说明
{ "fieldKey": "priority", "in": ["high", "critical"] }

// 组合：处理中 + 普通员工 → 某些字段只读
{ "and": [
    { "fieldKey": "status", "eq": "processing" },
    { "fieldKey": "userRole", "eq": "staff" }
  ]
}
```

### 6.4 前端消费 visible_when

```vue
<!-- DynamicField.vue 最终形态 -->
<template>
  <template v-if="isVisible && !shouldSkip">
    <!-- ... 组件渲染 ... -->
  </template>
</template>

<script setup>
import { evalCondition } from '@/utils/conditionEval'
const props = defineProps({ field, formData: Object, ... })

const isVisible = computed(() => {
  // active=false 直接跳过
  if (props.field.active === false) return false
  // visible_when 条件求值
  if (props.field.visibleWhen) return evalCondition(props.field.visibleWhen, props.formData)
  return true
})
</script>
```

---

## 7. 前端 vs AI 的分工

| | 前端工程师 | AI（后端开发） |
|---|---|---|
| **Schema 规范** | ✅ 设计：fieldType 有哪些、options 两种格式、visibleWhen 语义、权限码前缀 | 按规范建表、加列 |
| **组件实现** | ✅ DynamicField / DynamicForm / conditionEval | — |
| **种子数据** | ✅ 规划哪些工单类型需要哪些字段 | 按规划 INSERT |
| **接口** | — | ✅ GET/POST/PUT /form-configs |
| **联动逻辑** | ✅ watch + 条件求值器 | — |
| **校验规则** | ✅ rules computed 自动生成 + 合并 | 接口层参数校验兜底 |
| **权限** | ✅ permissions Set 解析 → visibleNavs / readonlyFields | role_permissions 表 + GET/role-permissions 接口 |

---

## 8. 面试话术参考

> "我设计了一套 Schema 驱动的动态表单引擎。首先我定义了 fieldType / options / visibleWhen 等语义规范，然后推动后端 form_field_configs 表按这个规范建。前端这边：DynamicField 组件支持 5 种 Element Plus 组件类型，还做了 options 纯字符串→对象数组的自动归一化；DynamicForm 组件 watch ticketType 自动重拉 schema，rules computed 根据 required 和 fieldType 自动生成校验规则并向外 emit 给外层 WorkOrderForm 合并。权限方面我设计了三层权限码（menu / action / field:readonly），后端 role_permissions 表就是按这个语义存的 — field:readonly:xxx 解析后传给 DynamicForm 的 readonlyFields prop，最终 DynamicField 渲染成 disabled 状态。"
