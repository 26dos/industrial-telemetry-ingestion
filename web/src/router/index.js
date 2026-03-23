import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { title: '登录' },
  },
  {
    path: '/',
    component: () => import('../layout/MainLayout.vue'),
    redirect: '/system-config',
    children: [
      { path: 'system-config', name: 'SystemConfig', component: () => import('../views/SystemConfig.vue'), meta: { title: '系统配置' } },
      { path: 'network', name: 'NetworkConfig', component: () => import('../views/NetworkConfig.vue'), meta: { title: '网络配置' } },
      { path: 'lora', name: 'LoraConfig', component: () => import('../views/LoraConfig.vue'), meta: { title: '无线配置' } },
      { path: 'serial', name: 'SerialManage', component: () => import('../views/SerialManage.vue'), meta: { title: '串口管理' } },
      { path: 'inverter', name: 'InverterManage', component: () => import('../views/InverterManage.vue'), meta: { title: '逆变器管理' } },
      { path: 'realtime', name: 'RealtimeData', component: () => import('../views/RealtimeData.vue'), meta: { title: '实时数据' } },
      { path: 'point-table', name: 'PointTable', component: () => import('../views/PointTable.vue'), meta: { title: '设备点表' } },
      { path: 'table-104', name: 'Table104', component: () => import('../views/Table104.vue'), meta: { title: '104点表' } },
      { path: 'system-info', name: 'SystemInfo', component: () => import('../views/SystemInfo.vue'), meta: { title: '系统信息' } },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const isLoggedIn = sessionStorage.getItem('collector_auth')
  if (to.path !== '/login' && !isLoggedIn) {
    next('/login')
  } else {
    next()
  }
})

export default router
