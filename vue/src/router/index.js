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
      component: Login,
      meta: { title: '登录' },
    },
    {
      path: '/',
      component: Layout,
      redirect: '/workbench', // 强制跳转工作台
      children: [
        {
          path: 'workbench',
          name: 'workbench',
          component: () => import('@/views/Workbench.vue'),
          meta: { title: '工作台' },
        },
        {
          path: 'work-orders',
          name: 'workOrderList',
          component: () => import('@/views/WorkOrderList.vue'),
          meta: { title: '工单列表' },
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
          path: 'usercontrol',
          name: 'userList',
          component: () => import('@/views/Userlist..vue'),
          meta: { title: '用户管理', roles: ['部长', '超级管理员'] },
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
