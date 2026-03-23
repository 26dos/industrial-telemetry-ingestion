<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header">
        <span>串口管理 <el-tag size="small" type="info">最大 {{ serialMax }} 个</el-tag></span>
        <div>
          <el-button type="primary" @click="handleAdd" :disabled="tableData.length >= serialMax">新增串口</el-button>
          <el-button type="success" @click="handleSave" :loading="saving">保存</el-button>
        </div>
      </div>
    </template>

    <el-table :data="tableData" border v-loading="loading" stripe>
      <el-table-column prop="index" label="序号" width="70" align="center" />
      <el-table-column label="设备路径" min-width="150">
        <template #default="{ row }">
          <el-input v-model="row.device" />
        </template>
      </el-table-column>
      <el-table-column label="波特率" width="130">
        <template #default="{ row }">
          <el-select v-model="row.baud_rate">
            <el-option v-for="b in baudRates" :key="b" :value="b" :label="b" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="数据位" width="90">
        <template #default="{ row }">
          <el-select v-model="row.data_bits">
            <el-option :value="7" label="7" />
            <el-option :value="8" label="8" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="停止位" width="90">
        <template #default="{ row }">
          <el-select v-model="row.stop_bits">
            <el-option :value="1" label="1" />
            <el-option :value="2" label="2" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="校验" width="100">
        <template #default="{ row }">
          <el-select v-model="row.parity">
            <el-option :value="0" label="无" />
            <el-option :value="1" label="奇" />
            <el-option :value="2" label="偶" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="模式" width="120">
        <template #default="{ row }">
          <el-select v-model="row.mode">
            <el-option :value="1" label="RS485" />
            <el-option :value="2" label="RS232" />
            <el-option :value="3" label="Lora" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="Lora通道" width="100">
        <template #default="{ row }">
          <el-input-number v-model="row.lora_channel" :min="0" :max="255" size="small" controls-position="right" />
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
import { getSerialInfo, setSerialInfo, getSerialMax } from '../api'
import { ElMessage } from 'element-plus'

const baudRates = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]
const tableData = ref([])
const serialMax = ref(4)
const loading = ref(false)
const saving = ref(false)

async function loadData() {
  loading.value = true
  try {
    const [infoRes, maxRes] = await Promise.all([getSerialInfo(), getSerialMax()])
    tableData.value = infoRes.data
    serialMax.value = maxRes.data.serial_max
  } finally {
    loading.value = false
  }
}

function handleAdd() {
  const nextIndex = tableData.value.length > 0
    ? Math.max(...tableData.value.map((s) => s.index)) + 1
    : 1
  tableData.value.push({
    index: nextIndex, device: `/dev/rs485-${nextIndex}`, baud_rate: 9600,
    data_bits: 8, stop_bits: 1, parity: 0, mode: 1, lora_channel: 0,
  })
}

function handleDelete(idx) {
  tableData.value.splice(idx, 1)
}

async function handleSave() {
  saving.value = true
  try {
    await setSerialInfo({ serials: tableData.value })
    ElMessage.success('串口配置已保存')
  } finally {
    saving.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
