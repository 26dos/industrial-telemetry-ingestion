import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { title: 'Sign In' },
  },
  {
    path: '/',
    component: () => import('../layout/MainLayout.vue'),
    redirect: '/system-config',
    children: [
      { path: 'system-config', name: 'SystemConfig', component: () => import('../views/SystemConfig.vue'), meta: { title: 'System Configuration' } },
      { path: 'network', name: 'NetworkConfig', component: () => import('../views/NetworkConfig.vue'), meta: { title: 'Network Configuration' } },
      { path: 'lora', name: 'LoRaConfig', component: () => import('../views/LoRaConfig.vue'), meta: { title: 'Wireless Configuration' } },
      { path: 'serial', name: 'SerialManage', component: () => import('../views/SerialManage.vue'), meta: { title: 'Serial Port Management' } },
      { path: 'inverter', name: 'InverterManage', component: () => import('../views/InverterManage.vue'), meta: { title: 'Inverter Management' } },
      { path: 'realtime', name: 'RealtimeData', component: () => import('../views/RealtimeData.vue'), meta: { title: 'Realtime Data' } },
      { path: 'point-table', name: 'PointTable', component: () => import('../views/PointTable.vue'), meta: { title: 'Device Point Table' } },
      { path: 'table-104', name: 'Table104', component: () => import('../views/Table104.vue'), meta: { title: 'IEC 104 Tables' } },
      { path: 'system-info', name: 'SystemInfo', component: () => import('../views/SystemInfo.vue'), meta: { title: 'System Information' } },
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
