<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header">
        <span>Inverter Management <el-tag size="small" type="info">Max {{ inverterMax }} units</el-tag></span>
        <div>
          <el-button type="primary" @click="handleAdd" :disabled="tableData.length >= inverterMax">Add</el-button>
          <el-button type="success" @click="handleSave" :loading="saving">Save</el-button>
        </div>
      </div>
    </template>

    <el-table :data="tableData" border v-loading="loading" stripe>
      <el-table-column prop="index" label="Index" width="70" align="center" />
      <el-table-column label="Modbus Address" width="130">
        <template #default="{ row }">
          <el-input-number v-model="row.modbus_address" :min="1" :max="247" size="small" controls-position="right" />
        </template>
      </el-table-column>
      <el-table-column label="LoRa Address" width="120">
        <template #default="{ row }">
          <el-input-number v-model="row.lora_address" :min="0" :max="255" size="small" controls-position="right" />
        </template>
      </el-table-column>
      <el-table-column label="Serial Port" width="110">
        <template #default="{ row }">
          <el-input-number v-model="row.serial_ref" :min="1" :max="99" size="small" controls-position="right" />
        </template>
      </el-table-column>
      <el-table-column label="Protocol" width="120">
        <template #default="{ row }">
          <el-select v-model="row.protocol">
            <el-option :value="1" label="Huawei" />
            <el-option :value="2" label="Ginlong" />
            <el-option :value="3" label="Other" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="Model" min-width="200">
        <template #default="{ row }">
          <el-input v-model="row.model" />
        </template>
      </el-table-column>
      <el-table-column label="Actions" width="80" align="center">
        <template #default="{ $index }">
          <el-button type="danger" link @click="handleDelete($index)">Delete</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getInverterInfo, setInverterInfo, getInverterMax } from '../api'
import { ElMessage } from 'element-plus'

const tableData = ref([])
const inverterMax = ref(100)
const loading = ref(false)
const saving = ref(false)

async function loadData() {
  loading.value = true
  try {
    const [infoRes, maxRes] = await Promise.all([getInverterInfo(), getInverterMax()])
    tableData.value = infoRes.data
    inverterMax.value = maxRes.data.inverter_max
  } finally {
    loading.value = false
  }
}

function handleAdd() {
  const nextIndex = tableData.value.length > 0
    ? Math.max(...tableData.value.map((i) => i.index)) + 1
    : 1
  tableData.value.push({
    index: nextIndex, modbus_address: 1, lora_address: nextIndex,
    serial_ref: 1, protocol: 1, model: '',
  })
}

function handleDelete(idx) {
  tableData.value.splice(idx, 1)
}

async function handleSave() {
  saving.value = true
  try {
    await setInverterInfo({ inverters: tableData.value })
    ElMessage.success('Inverter configuration saved')
  } finally {
    saving.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
