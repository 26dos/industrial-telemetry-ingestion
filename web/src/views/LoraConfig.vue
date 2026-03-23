<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header">
        <span>无线配置（Lora）</span>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </div>
    </template>

    <el-form :model="form" label-width="140px" v-loading="loading" style="max-width: 500px;">
      <el-form-item label="频率 (MHz)">
        <el-input-number v-model="form.frequency" :min="100" :max="1000" />
      </el-form-item>
      <el-form-item label="带宽 (KHz)">
        <el-select v-model="form.bandwidth">
          <el-option :value="125" label="125" />
          <el-option :value="250" label="250" />
          <el-option :value="500" label="500" />
        </el-select>
      </el-form-item>
      <el-form-item label="扩频因子">
        <el-input-number v-model="form.spreading_factor" :min="6" :max="12" />
      </el-form-item>
      <el-form-item label="编码率">
        <el-input-number v-model="form.coding_rate" :min="1" :max="4" />
      </el-form-item>
      <el-form-item label="发射功率 (dBm)">
        <el-input-number v-model="form.tx_power" :min="2" :max="30" />
      </el-form-item>
      <el-form-item label="同步字">
        <el-input-number v-model="form.sync_word" :min="0" :max="255" />
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import { getLoraInfo, setLoraInfo } from '../api'
import { ElMessage } from 'element-plus'

const form = reactive({
  frequency: 433, bandwidth: 125, spreading_factor: 7,
  coding_rate: 1, tx_power: 20, sync_word: 52,
})
const loading = ref(false)
const saving = ref(false)

async function loadLora() {
  loading.value = true
  try {
    const res = await getLoraInfo()
    Object.assign(form, res.data)
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    await setLoraInfo({ ...form })
    ElMessage.success('Lora 配置已保存')
  } finally {
    saving.value = false
  }
}

onMounted(loadLora)
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
