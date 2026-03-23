<template>
  <div class="login-wrapper">
    <div class="login-card">
      <h2>采集控制单元配置工具</h2>
      <p class="subtitle">管理员登录</p>
      <el-form :model="form" @submit.prevent="handleLogin">
        <el-form-item>
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入管理员口令"
            show-password
            size="large"
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" style="width:100%" @click="handleLogin">
            登 录
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()
const FIXED_PASSWORD = 'admin123'

const form = reactive({ password: '' })

function handleLogin() {
  if (!form.password) {
    ElMessage.warning('请输入口令')
    return
  }
  if (form.password === FIXED_PASSWORD) {
    sessionStorage.setItem('collector_auth', '1')
    ElMessage.success('登录成功')
    router.push('/')
  } else {
    ElMessage.error('口令错误')
  }
}
</script>

<style scoped>
.login-wrapper {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}
.login-card {
  background: #fff;
  padding: 40px 36px;
  border-radius: 12px;
  width: 380px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.login-card h2 {
  text-align: center;
  margin: 0 0 4px;
  color: #303133;
  font-size: 22px;
}
.subtitle {
  text-align: center;
  color: #909399;
  margin: 0 0 28px;
  font-size: 14px;
}
</style>
