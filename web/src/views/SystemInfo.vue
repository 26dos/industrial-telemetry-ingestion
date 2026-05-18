<template>
  <div>
    <el-card shadow="never" style="margin-bottom: 16px;">
      <template #header>
        <div class="card-header">
          <span>System Information</span>
          <el-button type="danger" @click="handleRestart">Restart Service</el-button>
        </div>
      </template>

      <el-descriptions :column="2" border v-loading="loading">
        <el-descriptions-item label="Program Version">{{ version }}</el-descriptions-item>
        <el-descriptions-item label="CPU Usage">
          <el-progress :percentage="cpuPercent" :color="progressColor(cpuPercent)" />
        </el-descriptions-item>
        <el-descriptions-item label="Total Memory">{{ sysInfo.mem_total }}</el-descriptions-item>
        <el-descriptions-item label="Available Memory">{{ sysInfo.mem_available }}</el-descriptions-item>
        <el-descriptions-item label="Memory Usage">
          <el-progress :percentage="memPercent" :color="progressColor(memPercent)" />
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { getVersion, getSystemInfo, restartService } from '../api'
import { ElMessage, ElMessageBox } from 'element-plus'

const version = ref('')
const sysInfo = reactive({
  mem_total: '', mem_available: '', mem_usage_per: '', cpu_usage_per: '',
})
const loading = ref(false)
let timer = null

const memPercent = computed(() => parseFloat(sysInfo.mem_usage_per) || 0)
const cpuPercent = computed(() => parseFloat(sysInfo.cpu_usage_per) || 0)

function progressColor(val) {
  if (val > 80) return '#f56c6c'
  if (val > 60) return '#e6a23c'
  return '#67c23a'
}

async function loadData() {
  loading.value = true
  try {
    const [verRes, infoRes] = await Promise.all([getVersion(), getSystemInfo()])
    version.value = verRes.data.version
    Object.assign(sysInfo, infoRes.data)
  } finally {
    loading.value = false
  }
}

async function handleRestart() {
  await ElMessageBox.confirm('Restart the telemetry collection service?', 'Confirm')
  await restartService()
  ElMessage.success('Service is restarting')
}

onMounted(() => {
  loadData()
  timer = setInterval(loadData, 5000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
