import { createRouter, createWebHistory } from 'vue-router'

import Login from '@/views/Login.vue'
import Layout from '@/layout/Layout.vue'
import { ElMessage } from 'element-plus'
import { currentUserInfo } from '@/utils/helpers'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: Login,//对应app.vue的router-view组件
      meta: { title: '登录' },
    },
    {
      path: '/',
      component: Layout,//对应app.vue的router-view组件
      redirect: '/workbench', // 强制跳转工作台
      children: [
        {
          path: 'workbench',
          name: 'workbench',
          component: () => import('@/views/Workbench.vue'),//对应layout/Layout.vue的router-view组件
          meta: { title: '工作台' },
        },
        {
          path: 'work-orders',
          name: 'work-orders',
          component: () => import('@/layout/listLayOut.vue'),
          meta: { title: '工单列表', menuKey: 'list' },
           children: [
            {
              path: '',
               name: 'workOrderList',
               component: () => import('@/views/WorkOrderList.vue'), meta: { title: '工单列表' }
            },

          ]
        },
        {
          path: 'work-orders/create',
          name: 'workOrderCreate',
          component: () => import('@/views/WorkOrderForm.vue'),
          meta: { title: '新建工单' },

        },
        {
          path: 'work-orders/:id',
          name: 'workOrderDetail',
          component: () => import('@/views/WorkOrderDetail.vue'),
          meta: { title: '工单详情' },
        },
        {
          path: 'work-orders/:id/edit',
          name: 'workOrderEdit',
          component: () => import('@/views/WorkOrderForm.vue'),
          meta: { title: '编辑工单' },
        },

        {
          path: 'systemcontrol',
          name: 'systemList',

          component: () => import('@/layout/listLayOut.vue'),

          meta: { title: '系统设置',
            roles: ['部长', '超级管理员'] ,
            menuKey: 'system'
          },
          children: [
            {
              // 子路由用相对路径（不带 /），才会拼成 /systemcontrol/usercontrol
              path: '',
              name: 'userList',
              component: () => import('@/views/UserList.vue'),//
              meta: { title: '用户管理' },
            },
            {
              path: 'rolecontrol',
              name: 'roleControl',
              component: () => import('@/views/RoleList.vue'),
              meta: { title: '角色权限' },
            },
            {
              path: 'deptcontrol',
              name: 'deptControl',
              component: () => import('@/views/deptcontrol.vue'),
              meta: { title: '组织架构' },
            },
             {
              path: 'userlogcontrol',
              name: 'userlogControl',
              component: () => import('@/views/UserLogControl.vue'),
              meta: { title: '用户操作日志' },
            },
          ],
        },
        {
          // 员工可查看自己的详情页，权限范围由后端按 id 控制，故不加 roles
          path: 'usercontrol/:id',
          name: 'userControl',
          component: () => import('@/views/UserControl.vue'),
          meta: { title: '用户详情' },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

// 全局前置守卫：登录态校验 + 角色权限校验（meta.roles）
router.beforeEach((to) => {
  const token = localStorage.getItem('oa_token')
  if (!token && to.path !== '/login') {
    return { path: '/login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }
  }
  if (token && to.path === '/login') {
    return '/workbench'
  }
  // 角色权限：路由声明了 meta.roles 且当前角色不在其中 → 弹提示并回工作台
  // 注意：必须重定向而非 return false —— 直输 URL 时应用尚未渲染，false 会导致白屏
  const roles = to.meta.roles
  if (roles && !roles.includes(currentUserInfo()?.role)) {
    ElMessage.warning('无权访问该页面')
    return '/workbench'
  }
  return true
})

export default router
