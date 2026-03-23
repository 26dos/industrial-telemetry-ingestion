<template>
  <div>
    <el-card shadow="never" style="margin-bottom: 16px;">
      <template #header>
        <div class="card-header">
          <span>逆变器点表管理</span>
          <el-upload
            :show-file-list="false"
            :before-upload="handleUpload"
            accept=".json"
          >
            <el-button type="primary">导入点表</el-button>
          </el-upload>
        </div>
      </template>

      <el-table :data="tableList" border stripe v-loading="loading">
        <el-table-column type="index" label="#" width="60" align="center" />
        <el-table-column prop="name" label="点表名称" min-width="260" />
        <el-table-column label="操作" width="200" align="center">
          <template #default="{ row }">
            <el-button type="primary" link @click="viewDetail(row.name)">查看</el-button>
            <el-button type="danger" link @click="handleDelete(row.name)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="detailVisible" :title="`点表详情: ${detailName}`" width="90%" top="5vh">
      <el-tabs v-model="detailTab">
        <el-tab-pane label="遥测 (YC)" name="yc">
          <el-table :data="detailData.yc" border size="small" max-height="400">
            <el-table-column prop="index" label="序号" width="60" />
            <el-table-column prop="name" label="名称" width="120" />
            <el-table-column prop="register" label="寄存器" width="80" />
            <el-table-column prop="data_type" label="数据类型" width="90" />
            <el-table-column prop="byte_order" label="字节序" width="80" />
            <el-table-column prop="factor" label="系数" width="80" />
            <el-table-column prop="dead_zone" label="死区" width="80" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="遥信 (YX)" name="yx">
          <el-table :data="detailData.yx" border size="small" max-height="400">
            <el-table-column prop="index" label="序号" width="60" />
            <el-table-column prop="name" label="名称" width="120" />
            <el-table-column prop="register" label="寄存器" width="80" />
            <el-table-column prop="data_type" label="数据类型" width="90" />
            <el-table-column prop="bit_offset" label="位偏移" width="80" />
            <el-table-column prop="bit_count" label="位长度" width="80" />
            <el-table-column prop="valid" label="有效值" width="80" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="遥调 (YT)" name="yt">
          <el-table :data="detailData.yt" border size="small" max-height="400">
            <el-table-column prop="index" label="序号" width="60" />
            <el-table-column prop="name" label="名称" width="120" />
            <el-table-column prop="register" label="寄存器" width="80" />
            <el-table-column prop="data_type" label="数据类型" width="90" />
            <el-table-column prop="factor" label="系数" width="80" />
            <el-table-column prop="value" label="默认值" width="80" />
            <el-table-column prop="use_defalut" label="使用默认" width="80" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="采集段 (Collect)" name="collect">
          <el-table :data="detailData.collect" border size="small" max-height="400">
            <el-table-column prop="index" label="序号" width="80" />
            <el-table-column prop="start_addr" label="起始地址" width="120" />
            <el-table-column prop="end_addr" label="结束地址" width="120" />
            <el-table-column prop="funcode" label="功能码" width="100" />
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
  ElMessage.success('点表上传成功')
  loadList()
  return false
}

async function handleDelete(name) {
  await ElMessageBox.confirm(`确定删除点表 "${name}" 吗？`, '确认')
  await deleteInverterTableFile(name)
  ElMessage.success('已删除')
  loadList()
}

onMounted(loadList)
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
