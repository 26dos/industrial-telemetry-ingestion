<template>
  <div>
    <el-card shadow="never" style="margin-bottom: 16px;">
      <template #header>
        <div class="card-header">
          <span>
            104 Realtime Data
            <el-tag :type="mqttConnected ? 'success' : 'danger'" size="small" style="margin-left: 8px;">
              MQTT {{ mqttConnected ? 'connected' : 'disconnected' }}
            </el-tag>
          </span>
          <div>
            <el-button @click="connectMqtt" :disabled="mqttConnected" size="small">Connect MQTT</el-button>
            <el-button type="primary" @click="loadAll">Refresh Snapshot</el-button>
          </div>
        </div>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="Measurements (YC)" name="yc">
          <el-table :data="ycData" border stripe size="small" max-height="400">
            <el-table-column prop="index" label="Point ID" width="70" align="center" />
            <el-table-column prop="inverter" label="Inverter" width="80" align="center" />
            <el-table-column prop="name" label="Name" min-width="180" />
            <el-table-column prop="value" label="Value" width="120" align="right" />
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="Status Signals (YX)" name="yx">
          <el-table :data="yxData" border stripe size="small" max-height="400">
            <el-table-column prop="index" label="Point ID" width="70" align="center" />
            <el-table-column prop="inverter" label="Inverter" width="80" align="center" />
            <el-table-column prop="name" label="Name" min-width="180" />
            <el-table-column label="Status" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="row.value ? 'success' : 'info'" size="small">
                  {{ row.value }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-card shadow="never">
      <template #header><span>Setpoints (YT)</span></template>
      <el-table :data="ytList" border stripe size="small">
        <el-table-column prop="index" label="Point ID" width="70" align="center" />
        <el-table-column prop="name" label="Name" min-width="200" />
        <el-table-column label="Setpoint Value" width="160">
          <template #default="{ row }">
            <el-input-number v-model="row._value" :precision="4" size="small" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="Actions" width="100" align="center">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="handleControl(row)">Send</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { getAllDataYC, getAllDataYX, getControlListYT, controlYT } from '../api'
import { useMqtt } from '../utils/mqtt'
import { ElMessage } from 'element-plus'

const activeTab = ref('yc')
const ycData = ref([])
const yxData = ref([])
const ytList = ref([])

const { connect: connectMqtt, connected: mqttConnected, ycUpdates, yxUpdates } = useMqtt()

watch(ycUpdates, (data) => {
  if (!data?.inverters) return
  const updated = [...ycData.value]
  let changed = false
  for (const inv of data.inverters) {
    for (const pt of inv.yc_data || []) {
      const idx = updated.findIndex((item) => item.index === pt.ycnum)
      if (idx !== -1) {
        updated[idx] = { ...updated[idx], value: pt.value }
        changed = true
      } else {
        updated.push({ index: pt.ycnum, inverter: Math.floor(pt.ycnum / 100) || 0, name: pt.name || `YC_${pt.ycnum}`, value: pt.value })
        changed = true
      }
    }
  }
  if (changed) ycData.value = updated
}, { deep: true })

watch(yxUpdates, (data) => {
  if (!data?.inverters) return
  const updated = [...yxData.value]
  let changed = false
  for (const inv of data.inverters) {
    for (const pt of inv.yx_data || []) {
      const idx = updated.findIndex((item) => item.index === pt.yxnum)
      if (idx !== -1) {
        updated[idx] = { ...updated[idx], value: pt.value }
        changed = true
      } else {
        updated.push({ index: pt.yxnum, inverter: Math.floor(pt.yxnum / 100) || 0, name: pt.name || `YX_${pt.yxnum}`, value: pt.value })
        changed = true
      }
    }
  }
  if (changed) yxData.value = updated
}, { deep: true })

async function loadAll() {
  const [ycRes, yxRes, ytRes] = await Promise.all([
    getAllDataYC(), getAllDataYX(), getControlListYT(),
  ])
  ycData.value = ycRes.data
  yxData.value = yxRes.data
  ytList.value = (ytRes.data.yt || []).map((item) => ({ ...item, _value: 0 }))
}

async function handleControl(row) {
  await controlYT({ index: row.index, value: row._value })
  ElMessage.success(`Setpoint [${row.name}] sent: ${row._value}`)
}

onMounted(() => {
  loadAll()
  connectMqtt()
})
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
