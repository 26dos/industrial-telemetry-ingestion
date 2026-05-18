<template>
  <div>
    <el-card shadow="never" style="margin-bottom: 16px;">
      <template #header>
        <div class="card-header">
          <span>InverterPoint Tables</span>
          <el-upload
            :show-file-list="false"
            :before-upload="handleUpload"
            accept=".json"
          >
            <el-button type="primary">Import Point Table</el-button>
          </el-upload>
        </div>
      </template>

      <el-table :data="tableList" border stripe v-loading="loading">
        <el-table-column type="index" label="#" width="60" align="center" />
        <el-table-column prop="name" label="Point Table Name" min-width="260" />
        <el-table-column label="Actions" width="200" align="center">
          <template #default="{ row }">
            <el-button type="primary" link @click="viewDetail(row.name)">View</el-button>
            <el-button type="danger" link @click="handleDelete(row.name)">Delete</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="detailVisible" :title="`Point Table Details: ${detailName}`" width="90%" top="5vh">
      <el-tabs v-model="detailTab">
        <el-tab-pane label="Measurements (YC)" name="yc">
          <el-table :data="detailData.yc" border size="small" max-height="400">
            <el-table-column prop="index" label="Index" width="60" />
            <el-table-column prop="name" label="Name" width="120" />
            <el-table-column prop="register" label="Register" width="80" />
            <el-table-column prop="data_type" label="Data Type" width="90" />
            <el-table-column prop="byte_order" label="Byte Order" width="80" />
            <el-table-column prop="factor" label="Scale" width="80" />
            <el-table-column prop="dead_zone" label="Deadband" width="80" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="Status Signals (YX)" name="yx">
          <el-table :data="detailData.yx" border size="small" max-height="400">
            <el-table-column prop="index" label="Index" width="60" />
            <el-table-column prop="name" label="Name" width="120" />
            <el-table-column prop="register" label="Register" width="80" />
            <el-table-column prop="data_type" label="Data Type" width="90" />
            <el-table-column prop="bit_offset" label="Bit Offset" width="80" />
            <el-table-column prop="bit_count" label="Bit Length" width="80" />
            <el-table-column prop="valid" label="Valid Value" width="80" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="Setpoints (YT)" name="yt">
          <el-table :data="detailData.yt" border size="small" max-height="400">
            <el-table-column prop="index" label="Index" width="60" />
            <el-table-column prop="name" label="Name" width="120" />
            <el-table-column prop="register" label="Register" width="80" />
            <el-table-column prop="data_type" label="Data Type" width="90" />
            <el-table-column prop="factor" label="Scale" width="80" />
            <el-table-column prop="value" label="Default Value" width="80" />
            <el-table-column prop="use_defalut" label="Use Default" width="80" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="Collection Ranges (Collect)" name="collect">
          <el-table :data="detailData.collect" border size="small" max-height="400">
            <el-table-column prop="index" label="Index" width="80" />
            <el-table-column prop="start_addr" label="Start Address" width="120" />
            <el-table-column prop="end_addr" label="End Address" width="120" />
            <el-table-column prop="funcode" label="Function Code" width="100" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import {
  getInverterTableList, getInverterTableInfo,
  uploadInverterTableFile, deleteInverterTableFile,
} from '../api'
import { ElMessage, ElMessageBox } from 'element-plus'

const tableList = ref([])
const loading = ref(false)
const detailVisible = ref(false)
const detailName = ref('')
const detailTab = ref('yc')
const detailData = reactive({ yc: [], yx: [], yt: [], collect: [] })

async function loadList() {
  loading.value = true
  try {
    const res = await getInverterTableList()
    tableList.value = (res.data || []).map((name) => ({ name }))
  } finally {
    loading.value = false
  }
}

async function viewDetail(name) {
  detailName.value = name
  detailTab.value = 'yc'
  const res = await getInverterTableInfo(name)
  Object.assign(detailData, { yc: [], yx: [], yt: [], collect: [], ...res.data })
  detailVisible.value = true
}

async function handleUpload(file) {
  await uploadInverterTableFile(file)
  ElMessage.success('Point table uploaded successfully')
  loadList()
  return false
}

async function handleDelete(name) {
  await ElMessageBox.confirm(`Delete point table "${name}" ?`, 'Confirm')
  await deleteInverterTableFile(name)
  ElMessage.success('Deleted')
  loadList()
}

onMounted(loadList)
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
