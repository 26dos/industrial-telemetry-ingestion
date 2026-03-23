<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header">
        <span>系统配置</span>
        <el-button type="primary" @click="handleSave" :loading="saving">保存配置</el-button>
      </div>
    </template>

    <el-form v-if="config" :model="config" label-width="160px" v-loading="loading">
      <h4>采集配置</h4>
      <el-row :gutter="24">
        <el-col :span="8">
          <el-form-item label="Modbus 超时(秒)">
            <el-input-number v-model="config.collect.modbus_timeout" :min="1" :max="60" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="采集周期(秒)">
            <el-input-number v-model="config.collect.collect_cycle" :min="1" :max="3600" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="控制检查周期(秒)">
            <el-input-number v-model="config.collect.control_check_cycle" :min="1" :max="60" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-divider />
      <h4>服务配置</h4>
      <el-row :gutter="24">
        <el-col :span="6">
          <el-form-item label="本地模式">
            <el-select v-model="config.server.local_mode">
              <el-option :value="0" label="远程" />
              <el-option :value="1" label="本地" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="服务器 IP">
            <el-input v-model="config.server.server_ip" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="服务器端口">
            <el-input-number v-model="config.server.server_port" :min="1" :max="65535" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="超时(秒)">
            <el-input-number v-model="config.server.timeout" :min="1" :max="600" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-divider />
      <h4>调控配置</h4>
      <el-row :gutter="24">
        <el-col :span="8">
          <el-form-item label="超时(秒)">
            <el-input-number v-model="config.control.timeout" :min="1" :max="600" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-divider />
      <h4>事件配置</h4>
      <el-row :gutter="24">
        <el-col :span="8">
          <el-form-item label="最大事件数">
            <el-input-number v-model="config.event.event_max_num" :min="1" :max="1024" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-divider />
      <h4>日志配置</h4>
      <el-row :gutter="24">
        <el-col :span="6">
          <el-form-item label="日志级别">
            <el-select v-model="config.log.level">
              <el-option :value="0" label="NONE" />
              <el-option :value="1" label="ERROR" />
              <el-option :value="2" label="WARN" />
              <el-option :value="3" label="INFO" />
              <el-option :value="4" label="DEBUG" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="备份数量">
            <el-input-number v-model="config.log.backup" :min="1" :max="100" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="最大大小(KB)">
            <el-input-number v-model="config.log.max_size" :min="100" :max="100000" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="控制台输出">
            <el-switch v-model="config.log.display" :active-value="1" :inactive-value="0" />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getConfigInfo, setConfigInfo } from '../api'
import { ElMessage } from 'element-plus'

const config = ref(null)
const loading = ref(false)
const saving = ref(false)

async function loadConfig() {
  loading.value = true
  try {
    const res = await getConfigInfo()
    config.value = res.data
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    await setConfigInfo(config.value)
    ElMessage.success('配置已保存')
  } finally {
    saving.value = false
  }
}

onMounted(loadConfig)
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
h4 { margin: 8px 0 16px; color: #303133; }
</style>
