<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header">
        <span>Network Configuration</span>
        <div>
          <el-button type="primary" @click="handleSave" :loading="saving">Save</el-button>
          <el-button type="warning" @click="handleRestart" :loading="restarting">Restart Network</el-button>
        </div>
      </div>
    </template>

    <el-form :model="form" label-width="120px" v-loading="loading" style="max-width: 500px;">
      <el-form-item label="IP Address">
        <el-input v-model="form.ip" placeholder="192.168.1.102" />
      </el-form-item>
      <el-form-item label="Subnet Mask">
        <el-input v-model="form.netmask" placeholder="255.255.255.0" />
      </el-form-item>
      <el-form-item label="Default Gateway">
        <el-input v-model="form.gateway" placeholder="192.168.1.1" />
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import { getNetwork, setNetwork, restartNetwork } from '../api'
import { ElMessage, ElMessageBox } from 'element-plus'

const form = reactive({ ip: '', netmask: '', gateway: '' })
const loading = ref(false)
const saving = ref(false)
const restarting = ref(false)

async function loadNetwork() {
  loading.value = true
  try {
    const res = await getNetwork()
    Object.assign(form, res.data)
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    await setNetwork({ ...form })
    ElMessage.success('Network configuration saved')
  } finally {
    saving.value = false
  }
}

async function handleRestart() {
  await ElMessageBox.confirm('Restart the network? The connection may drop briefly during restart.', 'Confirm')
  restarting.value = true
  try {
    await restartNetwork()
    ElMessage.success('Network restarted')
  } finally {
    restarting.value = false
  }
}

onMounted(loadNetwork)
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
