<template>
  <el-container class="layout-container">
    <el-aside width="220px" class="layout-aside">
      <div class="logo">
        <h3>Telemetry Collector</h3>
        <span class="sub">Configuration Console</span>
      </div>
      <el-menu
        :default-active="currentRoute"
        router
        background-color="#1d1e1f"
        text-color="#bfcbd9"
        active-text-color="#409eff"
      >
        <el-menu-item index="/system-config">
          <el-icon><Setting /></el-icon>
          <span>System Configuration</span>
        </el-menu-item>
        <el-menu-item index="/network">
          <el-icon><Connection /></el-icon>
          <span>Network Configuration</span>
        </el-menu-item>
        <el-menu-item index="/lora">
          <el-icon><Promotion /></el-icon>
          <span>Wireless Configuration</span>
        </el-menu-item>
        <el-menu-item index="/serial">
          <el-icon><SetUp /></el-icon>
          <span>Serial Port Management</span>
        </el-menu-item>
        <el-menu-item index="/inverter">
          <el-icon><Monitor /></el-icon>
          <span>Inverter Management</span>
        </el-menu-item>
        <el-sub-menu index="realtime-group">
          <template #title>
            <el-icon><DataLine /></el-icon>
            <span>Realtime Data</span>
          </template>
          <el-menu-item index="/realtime">IEC 104 Data</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="table-group">
          <template #title>
            <el-icon><Document /></el-icon>
            <span>Point Tables</span>
          </template>
          <el-menu-item index="/point-table">Device Point Table</el-menu-item>
          <el-menu-item index="/table-104">IEC 104 Tables</el-menu-item>
        </el-sub-menu>
        <el-menu-item index="/system-info">
          <el-icon><InfoFilled /></el-icon>
          <span>System Information</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="layout-header">
        <span class="page-title">{{ currentTitle }}</span>
        <el-button text @click="handleLogout">Sign Out</el-button>
      </el-header>
      <el-main class="layout-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Setting, Connection, Promotion, SetUp, Monitor,
  DataLine, Document, InfoFilled,
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()

const currentRoute = computed(() => route.path)
const currentTitle = computed(() => route.meta?.title || '')

function handleLogout() {
  sessionStorage.removeItem('collector_auth')
  router.push('/login')
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
}
.layout-aside {
  background: #1d1e1f;
  overflow-y: auto;
}
.logo {
  padding: 20px 16px 12px;
  text-align: center;
  border-bottom: 1px solid #333;
}
.logo h3 {
  color: #409eff;
  margin: 0;
  font-size: 16px;
}
.logo .sub {
  color: #888;
  font-size: 12px;
}
.layout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e4e7ed;
  background: #fff;
}
.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}
.layout-main {
  background: #f5f7fa;
}
</style>
