<template>
  <div>
    <el-card shadow="never" style="margin-bottom: 16px;">
      <template #header>
        <div class="card-header">
          <span>
            104 实时数据
            <el-tag :type="mqttConnected ? 'success' : 'danger'" size="small" style="margin-left: 8px;">
              MQTT {{ mqttConnected ? '已连接' : '未连接' }}
            </el-tag>
          </span>
          <div>
            <el-button @click="connectMqtt" :disabled="mqttConnected" size="small">连接MQTT</el-button>
            <el-button type="primary" @click="loadAll">总召刷新</el-button>
          </div>
        </div>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="遥测 (YC)" name="yc">
          <el-table :data="ycData" border stripe size="small" max-height="400">
            <el-table-column prop="index" label="点号" width="70" align="center" />
            <el-table-column prop="inverter" label="逆变器" width="80" align="center" />
            <el-table-column prop="name" label="名称" min-width="180" />
            <el-table-column prop="value" label="值" width="120" align="right" />
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="遥信 (YX)" name="yx">
          <el-table :data="yxData" border stripe size="small" max-height="400">
            <el-table-column prop="index" label="点号" width="70" align="center" />
            <el-table-column prop="inverter" label="逆变器" width="80" align="center" />
            <el-table-column prop="name" label="名称" min-width="180" />
            <el-table-column label="状态" width="100" align="center">
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
      <template #header><span>遥调下发 (YT)</span></template>
      <el-table :data="ytList" border stripe size="small">
        <el-table-column prop="index" label="点号" width="70" align="center" />
        <el-table-column prop="name" label="名称" min-width="200" />
        <el-table-column label="下发值" width="160">
          <template #default="{ row }">
            <el-input-number v-model="row._value" :precision="4" size="small" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="handleControl(row)">下发</el-button>
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

// MQTT 变化推送 -> 合并到本地数据
watch(ycUpdates, (data) => {
  if (!data?.inverters) return
  for (const inv of data.inverters) {
    for (const pt of inv.yc_data || []) {
      const found = ycData.value.find((item) => item.index === pt.ycnum)
      if (found) found.value = pt.value
    }
  }
})

watch(yxUpdates, (data) => {
  if (!data?.inverters) return
  for (const inv of data.inverters) {
    for (const pt of inv.yx_data || []) {
      const found = yxData.value.find((item) => item.index === pt.yxnum)
      if (found) found.value = pt.value
    }
  }
})

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
  ElMessage.success(`遥调 [${row.name}] 已下发: ${row._value}`)
}

onMounted(() => {
  loadAll()
  connectMqtt()
})
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
