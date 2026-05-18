<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header">
        <span>System Configuration</span>
        <el-button type="primary" @click="handleSave" :loading="saving">Save Configuration</el-button>
      </div>
    </template>

    <el-form v-if="config" :model="config" label-width="160px" v-loading="loading">
      <h4>Collection Settings</h4>
      <el-row :gutter="24">
        <el-col :span="8">
          <el-form-item label="Modbus Timeout(s)">
            <el-input-number v-model="config.collect.modbus_timeout" :min="1" :max="60" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="Collection Interval(s)">
            <el-input-number v-model="config.collect.collect_cycle" :min="1" :max="3600" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="Control Poll Interval(s)">
            <el-input-number v-model="config.collect.control_check_cycle" :min="1" :max="60" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-divider />
      <h4>Service Settings</h4>
      <el-row :gutter="24">
        <el-col :span="6">
          <el-form-item label="LocalMode">
            <el-select v-model="config.server.local_mode">
              <el-option :value="0" label="Remote" />
              <el-option :value="1" label="Local" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="Server IP">
            <el-input v-model="config.server.server_ip" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="Server Port">
            <el-input-number v-model="config.server.server_port" :min="1" :max="65535" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="Timeout(s)">
            <el-input-number v-model="config.server.timeout" :min="1" :max="600" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-divider />
      <h4>Control Settings</h4>
      <el-row :gutter="24">
        <el-col :span="8">
          <el-form-item label="Timeout(s)">
            <el-input-number v-model="config.control.timeout" :min="1" :max="600" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-divider />
      <h4>Event Settings</h4>
      <el-row :gutter="24">
        <el-col :span="8">
          <el-form-item label="Max Events">
            <el-input-number v-model="config.event.event_max_num" :min="1" :max="1024" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-divider />
      <h4>Logging Settings</h4>
      <el-row :gutter="24">
        <el-col :span="6">
          <el-form-item label="Log Level">
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
          <el-form-item label="Backup Count">
            <el-input-number v-model="config.log.backup" :min="1" :max="100" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="Max Size(KB)">
            <el-input-number v-model="config.log.max_size" :min="100" :max="100000" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="Console Output">
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
    ElMessage.success('Configuration saved')
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
