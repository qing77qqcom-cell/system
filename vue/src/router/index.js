import { createRouter, createWebHistory } from 'vue-router'
import Login from '@/views/Login.vue'
import Layout from '@/components/layout/Layout.vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/store.js'

/**
 * 路由架构（v1：全静态注册）
 *  - 所有 Layout children 启动时一次性注册，不做动态 addRoute
 *  - 页面级权限拦截：router.beforeEach 里按 meta.perm 兜底
 *  - 菜单级权限：Layout.vue 的 visibleNavs 按 roles + perm 双重过滤
 *
 * 后续如需升级回动态路由：把 children 里的项搬到 asyncRoutes + addRoute 即可
 */
const constantRoutes = [
  {
    path: '/login',
    name: 'login',
    component: Login,
    meta: { title: '登录' },
  },//app的router-view
  {//app的router-view
    path: '/',
    name: 'root',
    component: Layout,//一级菜单
    redirect: '/workbench',
    children: [
      // —— 静态路由（不受权限码控）——
      {
        path: 'usercontrol/:id',
        name: 'userControl',
        component: () => import('@/views/UserControl.vue'),//layout的router-view
        meta: { title: '用户详情' },
      },

      // —— 工作台 ——
      {
        path: 'workbench',
        name: 'workbench',
        component: () => import('@/views/Workbench.vue'),//layout的router-view
        meta: { title: '工作台', perm: 'menu:workbench' },
        redirect: '/workbench/todo',
        children: [//workbench的router-view
          {
            path: 'todo',
            name: 'workbenchTodo',
            component: () => import('@/views/TodoPanel.vue'),
            meta: { title: '通知待办', perm: 'menu:workbench' },
          },

          // —— 全局数据分析（5 个独立页面，原 datalist.vue 已废弃）——
          {
            path: 'stats/overview',
            name: 'statsOverview',
            component: () => import('@/views/stats/StatsOverview.vue'),
            meta: { title: '工单总览', perm: 'menu:stats' },
          },
          {
            path: 'stats/trend',
            name: 'statsTrend',
            component: () => import('@/views/stats/StatsTrend.vue'),
            meta: { title: '趋势分析', perm: 'menu:stats' },
          },
          {
            path: 'stats/status',
            name: 'statsStatus',
            component: () => import('@/views/stats/StatsStatus.vue'),
            meta: { title: '状态分布', perm: 'menu:stats' },
          },
          {
            path: 'stats/sla',
            name: 'statsSla',
            component: () => import('@/views/stats/StatsSla.vue'),
            meta: { title: 'SLA 时效', perm: 'menu:stats' },
          },
          {
            path: 'stats/workload',
            name: 'statsWorkload',
            component: () => import('@/views/stats/StatsWorkload.vue'),
            meta: { title: '部门排行', perm: 'menu:stats' },
          },
          // 兼容旧链接：/workbench/datalist → 工单总览
          { path: 'datalist', redirect: '/workbench/stats/overview' },

          {
            path: 'workorderlist',
            name: 'workbenchWorkOrderList',
            component: () => import('@/views/WorkOrderList.vue'),
            meta: { title: '工单列表', perm: 'menu:tickets' },
          },
        ],
      },

      // —— 工单列表 & 详情（独立入口）——//layout的router-view
      {
        path: 'work-orders',
        name: 'workOrders',
        component: () => import('@/views/WorkOrderList.vue'),
        meta: { title: '工单列表', perm: 'menu:tickets' },
      },
      {
        path: 'work-orders/create',
        name: 'workOrderCreate',
        component: () => import('@/views/WorkOrderForm.vue'),
        meta: { title: '新建工单', perm: 'menu:work-order-create' },
      },
      {
        path: 'work-orders/:id',
        name: 'workOrderDetail',
        component: () => import('@/views/WorkOrderDetail.vue'),
        meta: { title: '工单详情', perm: 'menu:tickets' },
      },
      {
        path: 'work-orders/:id/edit',
        name: 'workOrderEdit',
        component: () => import('@/views/WorkOrderForm.vue'),
        meta: { title: '编辑工单', perm: 'menu:tickets' },
      },

      // —— 系统设置（MenuLayout 壳：AsideBar + router-view）——
      {
        path: 'systemcontrol',
        name: 'systemcontrol',
        component: () => import('@/components/layout/MenuLayout.vue'),
        props: { topIndex: '/systemcontrol' },
        meta: { title: '系统设置', perm: 'menu:system-config' },
        redirect: '/systemcontrol',
        children: [
          {
            path: '',
            name: 'userList',
            component: () => import('@/views/UserList.vue'),
            meta: { title: '用户管理', perm: 'menu:user-manage' },
          },
          {
            path: 'rolecontrol',
            name: 'roleControl',
            component: () => import('@/views/RoleList.vue'),
            meta: { title: '角色权限', perm: 'menu:user-manage' },
          },
          {
            path: 'deptcontrol',
            name: 'deptControl',
            component: () => import('@/views/deptcontrol.vue'),
            meta: { title: '组织架构', perm: 'menu:system-config' },
          },
          {
            path: 'approval-flow',
            name: 'approvalFlow',
            component: () => import('@/views/ApprovalFlowEditor.vue'),
            meta: { title: '审批流程配置', perm: 'menu:system-config' },
          },
          {
            path: 'sla-config',
            name: 'slaConfig',
            component: () => import('@/views/SlaConfig.vue'),
            meta: { title: 'SLA 时效配置', perm: 'menu:system-config' },
          },
          {
            path: 'basic-config',
            name: 'basicConfig',
            component: () => import('@/views/BasicConfig.vue'),
            meta: { title: '基础数据配置', perm: 'menu:system-config' },
          },
          {
            path: 'userlogcontrol',
            name: 'userlogControl',
            component: () => import('@/views/UserLogControl.vue'),
            meta: { title: '操作日志', perm: 'menu:logs' },
          },
          {
            path: 'loginlogcontrol',
            name: 'loginlogControl',
            component: () => import('@/views/LoginLogControl.vue'),
            meta: { title: '登录日志', perm: 'menu:logs' },
          },
        ],
      },

      // —— 部长专属（MenuLayout 壳：横向二级 + AsideBar 三级 + router-view）——
      {
        path: 'approval-center',
        component: () => import('@/components/layout/MenuLayout.vue'),
        props: { topIndex: '/approval-center' },
        meta: { title: '审批中心', perm: 'menu:approval-center' },
        children: [
          { path: '', name: 'approvalCenter', component: () => import('@/views/ApprovalCenter.vue') },
        ],
      },
      {
        path: 'team-manage',
        component: () => import('@/components/layout/MenuLayout.vue'),
        props: { topIndex: '/team-manage' },
        meta: { title: '团队管理', perm: 'menu:team-manage' },
        children: [
          { path: '', name: 'teamManage', component: () => import('@/views/TeamManage.vue') },
        ],
      },

      // —— 全员可见（帮助中心无权限门槛，也用 MenuLayout 壳）——
      {
        path: 'help',
        component: () => import('@/components/layout/MenuLayout.vue'),
        props: { topIndex: '/help' },
        meta: { title: '帮助中心' },
        children: [
          { path: '', name: 'helpCenter', component: () => import('@/views/HelpCenter.vue') },
        ],
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

// ====== 实例化 router ======
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: constantRoutes,
})

// ====== 全局前置守卫 ======
router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // 1. 未登录 → 跳 /login
  if (!auth.isLoggedIn && to.path !== '/login') {
    return { path: '/login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }
  }

  // 2. 已登录 → 不让再进 /login
  if (auth.isLoggedIn && to.path === '/login') {
    return '/workbench'
  }

  // 3. 登录后首次进入 → 拉权限码（Layout 菜单渲染、路由 meta.perm 校验都依赖它）
  if (auth.isLoggedIn && auth.permissions.size === 0) {
    await auth.loadPermissions()
  }

  // 4. 兜底：meta.perm 不匹配 → 弹警告 + 回工作台
  if (to.meta?.perm && !auth.hasPerm(to.meta.perm)) {
    ElMessage.warning('无权访问该页面')
    return '/workbench'
  }

  return true
})

export default router
