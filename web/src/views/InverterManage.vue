<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header">
        <span>逆变器管理 <el-tag size="small" type="info">最大 {{ inverterMax }} 台</el-tag></span>
        <div>
          <el-button type="primary" @click="handleAdd" :disabled="tableData.length >= inverterMax">新增</el-button>
          <el-button type="success" @click="handleSave" :loading="saving">保存</el-button>
        </div>
      </div>
    </template>

    <el-table :data="tableData" border v-loading="loading" stripe>
      <el-table-column prop="index" label="序号" width="70" align="center" />
      <el-table-column label="Modbus地址" width="130">
        <template #default="{ row }">
          <el-input-number v-model="row.modbus_address" :min="1" :max="247" size="small" controls-position="right" />
        </template>
      </el-table-column>
      <el-table-column label="Lora地址" width="120">
        <template #default="{ row }">
          <el-input-number v-model="row.lora_address" :min="0" :max="255" size="small" controls-position="right" />
        </template>
      </el-table-column>
      <el-table-column label="关联串口" width="110">
        <template #default="{ row }">
          <el-input-number v-model="row.serial_ref" :min="1" :max="99" size="small" controls-position="right" />
        </template>
      </el-table-column>
      <el-table-column label="协议" width="120">
        <template #default="{ row }">
          <el-select v-model="row.protocol">
            <el-option :value="1" label="华为" />
            <el-option :value="2" label="锦浪" />
            <el-option :value="3" label="其他" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="型号" min-width="200">
        <template #default="{ row }">
          <el-input v-model="row.model" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="80" align="center">
        <template #default="{ $index }">
          <el-button type="danger" link @click="handleDelete($index)">删除</el-button>
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
    ElMessage.success('逆变器配置已保存')
  } finally {
    saving.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
