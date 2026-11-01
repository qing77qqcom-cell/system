/**
 * 三角色完整菜单树（含一级/二级/三级）
 *
 * 一级菜单 → Layout.vue ROLE_MENUS（顶栏 horizontal el-menu）
 * 二级/三级菜单 → AsideBar.vue（左侧 vertical el-menu，el-sub-menu 嵌套）
 *
 * 数据结构：
 *   { title, index, icon?, children? }
 *   - title: 显示名
 *   - index: 路由 path（el-menu router 模式按这个跳转）
 *   - icon:  Element Plus 图标组件（el-icon :is="icon"）
 *   - children: 子菜单数组，有 → el-sub-menu 展开；无 → el-menu-item 叶子节点
 *
 * 用法：
 *   import { ROLE_MENU_TREE } from '@/schema/menu-config'
 *   const tree = ROLE_MENU_TREE[auth.role] || []
 *
 * 父组件（AsideBar）只渲染传入的数组，不做角色判断。
 * 角色判断在 Layout.vue / Workbench.vue 里选好后传下来。
 */
import {
  Tickets,
  Setting,
  DataAnalysis,
  Monitor,
  User,
  Lock,
  Menu as IconMenu,
  Location,
  Document,
  Bell,
  Warning,
  List,
  CircleCheck,
  Collection,
  UserFilled,
  Avatar,
  Files,
  HelpFilled,
  Cpu,
  Wallet,
} from '@element-plus/icons-vue'

// ============== 一级菜单（Layout.vue 顶栏）==============
// 和 Layout.vue 的 ROLE_MENUS 保持一致，这里导出给所有组件统一引用
export const TOP_MENUS = {
  '超级管理员': [
    { index: '/workbench',     title: '工作台',   icon: Tickets },
    { index: '/systemcontrol', title: '系统设置', icon: Setting },
  ],
  '技术部部长': [
    { index: '/workbench',       title: '工作台',   icon: Tickets },
    { index: '/approval-center', title: '审批中心', icon: Lock },
    { index: '/team-manage',     title: '团队管理', icon: UserFilled },
  ],
  '技术部普通员工': [
    { index: '/workbench',          title: '工作台',   icon: Tickets },
    { index: '/work-orders/create', title: '工单创建', icon: Files },
    { index: '/help',               title: '帮助',     icon: HelpFilled },
  ],
}

// ============== 完整菜单树（含二级/三级）==============
// Layout.vue ROLE_MENUS 只保留一级；这里每个一级下面展开 children
export const ROLE_MENU_TREE = {

  // ===== 超级管理员 =====
  '超级管理员': [
    {
      index: '/workbench',
      title: '工作台',
      icon: Tickets,
      children: [
        {
          index: '/workbench/todo',
          title: '通知待办',
          icon: Bell,
          children: [
            { index: '/workbench/todo?tab=notice',  title: '系统公告' },
            { index: '/workbench/todo?tab=todo',    title: '全局待办' },
            { index: '/workbench/todo?tab=abnormal', title: '异常告警' },
            { index: '/workbench/todo?tab=sla',     title: '超时工单' },
          ],
        },
        {
          index: '/workbench/datalist',
          title: '全局数据分析',
          icon: DataAnalysis,
          children: [
            { index: '/workbench/datalist?tab=overview',   title: '工单总览' },
            { index: '/workbench/datalist?tab=trend',     title: '趋势分析' },
            { index: '/workbench/datalist?tab=distribution', title: '状态分布' },
            { index: '/workbench/datalist?tab=sla',        title: 'SLA 时效' },
            { index: '/workbench/datalist?tab=workload',   title: '部门排行' },
          ],
        },
        {
          index: '/workbench/workorderlist',
          title: '全部工单列表',
          icon: List,
          children: [
            { index: '/workbench/workorderlist?status=',         title: '全部工单' },
            { index: '/workbench/workorderlist?status=pending_approval', title: '待审批' },
            { index: '/workbench/workorderlist?status=processing', title: '处理中' },
            { index: '/workbench/workorderlist?status=closed',   title: '已关闭' },
          ],
        },
      ],
    },

    {
      index: '/systemcontrol',
      title: '系统设置',
      icon: Setting,
      children: [
        // —— 组织与权限管理 ——
        {
          index: '/systemcontrol/org-perm',
          title: '组织与权限管理',
          icon: User,
          children: [
            { index: '/systemcontrol',              title: '用户管理' },
            { index: '/systemcontrol/deptcontrol',  title: '组织架构' },
            { index: '/systemcontrol/rolecontrol',  title: '角色与权限' },
          ],
        },

        // —— 流程与规则配置 ——
        {
          index: '/systemcontrol/flow-rule',
          title: '流程与规则配置',
          icon: Document,
          children: [
            {
              index: '/systemcontrol/approval-flow',
              title: '审批流程',
              children: [
                { index: '/systemcontrol/approval-flow?tab=list',   title: '流程列表' },
                { index: '/systemcontrol/approval-flow?tab=editor', title: '流程编辑器' },
              ],
            },
            { index: '/systemcontrol/sla-config?tab=rules',    title: 'SLA 时效规则' },
            { index: '/systemcontrol/sla-config?tab=calendar',  title: '工作日历' },
          ],
        },

        // —— 基础数据配置 ——
        {
          index: '/systemcontrol/basic',
          title: '基础数据配置',
          icon: Collection,
          children: [
            { index: '/systemcontrol/basic-config?tab=dict',     title: '数据字典' },
            { index: '/systemcontrol/basic-config?tab=form',     title: '表单字段' },
            { index: '/systemcontrol/basic-config?tab=template', title: '通知模板' },
            { index: '/systemcontrol/basic-config?tab=params',   title: '系统参数' },
          ],
        },

        // —— 安全与审计 ——
        {
          index: '/systemcontrol/security',
          title: '安全与审计',
          icon: Lock,
          children: [
            { index: '/systemcontrol/loginlogcontrol', title: '登录日志' },
            { index: '/systemcontrol/userlogcontrol',  title: '操作日志' },
          ],
        },
      ],
    },
  ],

  // ===== 技术部部长 =====
  '技术部部长': [
    {
      index: '/workbench',
      title: '工作台',
      icon: Tickets,
      children: [
        {
          index: '/workbench/todo',
          title: '通知待办',
          icon: Bell,
          children: [
            { index: '/workbench/todo?tab=approval', title: '待我审批' },
            { index: '/workbench/todo?tab=dept',     title: '部门待办' },
            { index: '/workbench/todo?tab=sla',      title: '超时预警' },
            { index: '/workbench/todo?tab=notice',   title: '系统公告' },
          ],
        },
        {
          index: '/workbench/datalist',
          title: '部门数据分析',
          icon: DataAnalysis,
          children: [
            { index: '/workbench/datalist?tab=overview',   title: '部门工单量' },
            { index: '/workbench/datalist?tab=workload',    title: '成员处理量' },
            { index: '/workbench/datalist?tab=sla',        title: 'SLA 达成率' },
            { index: '/workbench/datalist?tab=distribution', title: '积压工单' },
          ],
        },
        {
          index: '/workbench/workorderlist',
          title: '本部门工单列表',
          icon: List,
          children: [
            { index: '/workbench/workorderlist?tab=dept',    title: '本部门工单' },
            { index: '/workbench/workorderlist?tab=mine',     title: '我发起的' },
            { index: '/workbench/workorderlist?tab=handled',  title: '我处理的' },
            { index: '/workbench/workorderlist?tab=escalated', title: '异常工单' },
          ],
        },
      ],
    },

    {
      index: '/approval-center',
      title: '审批中心',
      icon: Lock,
      children: [
        { index: '/approval-center?tab=pending', title: '待审批',   icon: Warning },
        { index: '/approval-center?tab=done',    title: '已审批',   icon: CircleCheck },
        { index: '/approval-center?tab=transfer', title: '转办记录' },
      ],
    },

    {
      index: '/team-manage',
      title: '团队管理',
      icon: UserFilled,
      children: [
        { index: '/team-manage?tab=members',  title: '部门成员',    icon: Avatar },
        { index: '/team-manage?tab=workload', title: '成员工单负荷', icon: Monitor },
        { index: '/team-manage?tab=assign',   title: '指派/转派',    icon: Location },
        { index: '/team-manage?tab=perf',     title: '成员绩效',     icon: DataAnalysis },
      ],
    },
  ],

  // ===== 技术部普通员工 =====
  '技术部普通员工': [
    {
      index: '/workbench',
      title: '工作台',
      icon: Tickets,
      children: [
        {
          index: '/workbench/todo',
          title: '通知待办',
          icon: Bell,
          children: [
            { index: '/workbench/todo?tab=todo',     title: '我的待办' },
            { index: '/workbench/todo?tab=result',   title: '审批结果' },
            { index: '/workbench/todo?tab=sla',      title: '超时提醒' },
            { index: '/workbench/todo?tab=notice',   title: '系统公告' },
          ],
        },
        {
          index: '/workbench/datalist',
          title: '我的统计',
          icon: DataAnalysis,
          children: [
            { index: '/workbench/datalist?tab=submitted', title: '我提交的' },
            { index: '/workbench/datalist?tab=handled',   title: '我处理的' },
            { index: '/workbench/datalist?tab=status',    title: '待处理/已完成' },
            { index: '/workbench/datalist?tab=sla',       title: '超时数' },
          ],
        },
        {
          index: '/workbench/workorderlist',
          title: '工单列表',
          icon: List,
          children: [
            { index: '/workbench/workorderlist?tab=mine',     title: '我提交的' },
            { index: '/workbench/workorderlist?tab=handled',  title: '我处理的' },
            { index: '/workbench/workorderlist?tab=draft',    title: '草稿箱' },
            { index: '/workbench/workorderlist?tab=all',      title: '工单大厅' },
          ],
        },
      ],
    },

    {
      index: '/work-orders/create',
      title: '工单创建',
      icon: Files,
      children: [
        { index: '/work-orders/create?type=account', title: '账号权限',  icon: Cpu },
        { index: '/work-orders/create?type=device',  title: '设备故障',  icon: CircleCheck },
        { index: '/work-orders/create?type=expense', title: '费用报销',  icon: Wallet },
        { index: '/work-orders/drafts',              title: '草稿箱',    icon: Document },
      ],
    },

    {
      index: '/help',
      title: '帮助中心',
      icon: HelpFilled,
      children: [
        { index: '/help?tab=faq',      title: '常见问题' },
        { index: '/help?tab=guide',    title: '操作指南' },
        { index: '/help?tab=standard', title: '工单规范' },
      ],
    },
  ],
}

// ============ 通用工具 ============

/**
 * 取某个一级菜单下的子树（二级+三级）
 * 父组件（如 Workbench.vue）用这个拿到子菜单传 AsideBar
 *
 * @param {string} role      - 角色名
 * @param {string} topIndex  - 一级菜单的 index，如 '/workbench'
 * @returns {object|null}    - 匹配的菜单项（含 children），没找到返回 null
 */
export function getSubTree(role, topIndex) {
  const tree = ROLE_MENU_TREE[role] || []
  return tree.find((m) => m.index === topIndex) || null
}

/**
 * 取当前角色的一级菜单数组（Layout.vue 顶栏用）
 */
export function getTopMenus(role) {
  return TOP_MENUS[role] || []
}
