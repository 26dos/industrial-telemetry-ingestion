<template>
  <div>
    <el-card shadow="never" style="margin-bottom: 16px;">
      <template #header>
        <div class="card-header">
          <span>104 转发表管理</span>
          <el-upload :show-file-list="false" :before-upload="handleUpload" accept=".json">
            <el-button type="primary">导入转发表</el-button>
          </el-upload>
        </div>
      </template>

      <el-table :data="tableList" border stripe v-loading="loading">
        <el-table-column type="index" label="#" width="60" align="center" />
        <el-table-column prop="name" label="转发表名称" min-width="220" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.name === currentUse" type="success" size="small">使用中</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" align="center">
          <template #default="{ row }">
            <el-button type="success" link @click="handleUse(row.name)" :disabled="row.name === currentUse">启用</el-button>
            <el-button type="primary" link @click="viewDetail(row.name)">查看</el-button>
            <el-button type="danger" link @click="handleDelete(row.name)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="detailVisible" :title="`104 转发表: ${detailName}`" width="80%" top="5vh">
      <el-tabs v-model="detailTab">
        <el-tab-pane label="遥测 (YC)" name="yc">
          <el-table :data="detailData.yc" border size="small" max-height="400">
            <el-table-column prop="index" label="点号" width="70" />
            <el-table-column prop="name" label="名称" min-width="180" />
            <el-table-column prop="inverter" label="逆变器" width="80" />
            <el-table-column prop="factor" label="系数" width="120" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="遥信 (YX)" name="yx">
          <el-table :data="detailData.yx" border size="small" max-height="400">
            <el-table-column prop="index" label="点号" width="70" />
            <el-table-column prop="name" label="名称" min-width="200" />
            <el-table-column prop="inverter" label="逆变器" width="80" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="遥调 (YT)" name="yt">
          <el-table :data="detailData.yt" border size="small" max-height="400">
            <el-table-column prop="index" label="点号" width="70" />
            <el-table-column prop="name" label="名称" min-width="200" />
            <el-table-column prop="inverter" label="逆变器" width="80" />
            <el-table-column prop="factor" label="系数" width="120" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { get104List, get104Info, set104File, upload104File, delete104File } from '../api'
import { ElMessage, ElMessageBox } from 'element-plus'

const tableList = ref([])
const currentUse = ref('')
const loading = ref(false)
const detailVisible = ref(false)
const detailName = ref('')
const detailTab = ref('yc')
const detailData = reactive({ yc: [], yx: [], yt: [] })

async function loadList() {
  loading.value = true
  try {
    const res = await get104List()
    tableList.value = (res.data.list || []).map((name) => ({ name }))
    currentUse.value = res.data.use || ''
  } finally {
    loading.value = false
  }
}

async function viewDetail(name) {
  detailName.value = name
  detailTab.value = 'yc'
  const res = await get104Info(name)
  Object.assign(detailData, { yc: [], yx: [], yt: [], ...res.data })
  detailVisible.value = true
}

async function handleUse(name) {
  await set104File(name)
  currentUse.value = name
  ElMessage.success(`已启用: ${name}`)
}

async function handleUpload(file) {
  await upload104File(file)
  ElMessage.success('转发表上传成功')
  loadList()
  return false
}

async function handleDelete(name) {
  await ElMessageBox.confirm(`确定删除转发表 "${name}" 吗？`, '确认')
  await delete104File(name)
  ElMessage.success('已删除')
  loadList()
}

onMounted(loadList)
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
