<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { User, Lock, View, Hide, Tickets } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const loginFormRef = ref()
const loading = ref(false)
const passwordVisible = ref(false)

const loginForm = reactive({
  username: '',
  password: '',
  remember: false,
})

const rules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于 6 位', trigger: 'blur' },
  ],
}

const handleLogin = () => {
  loginFormRef.value.validate((valid) => {
    if (!valid) return
    loading.value = true
    // 模拟登录请求：暂不做角色权限，校验通过即写入登录态
    setTimeout(() => {
      loading.value = false
      localStorage.setItem(
        'oa_token',
        JSON.stringify({ username: loginForm.username, loginTime: Date.now() }),
      )
      ElMessage.success('登录成功，欢迎回来！')
      router.push(route.query.redirect || '/workbench')
    }, 800)
  })
}
</script>

<template>
  <div class="login-page">
    <!-- 背景装饰圆 -->
    <div class="bg-circle circle-1"></div>
    <div class="bg-circle circle-2"></div>
    <div class="bg-circle circle-3"></div>

    <div class="login-card">
      <!-- 顶部 Logo + 系统名称 -->
      <div class="login-header">
        <div class="logo">
          <el-icon :size="34"><Tickets /></el-icon>
        </div>
        <h1 class="system-title">OA企业工单管理系统</h1>
        <p class="system-subtitle">ENTERPRISE WORK ORDER SYSTEM</p>
      </div>

      <!-- 登录表单 -->
      <el-form
      
        ref="loginFormRef"  
        :model="loginForm"
        :rules="rules"
        size="large"
        class="login-form"
        @keyup.enter="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="loginForm.username"
            placeholder="请输入账号"
            :prefix-icon="User"
            clearable
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="loginForm.password"
            :type="passwordVisible ? 'text' : 'password'"
            placeholder="请输入密码"
            :prefix-icon="Lock"
          >
            <template #suffix>
              <el-icon class="password-toggle" @click="passwordVisible = !passwordVisible">
                <View v-if="!passwordVisible" />
                <Hide v-else />
              </el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item class="remember-item">
          <el-checkbox v-model="loginForm.remember">记住我</el-checkbox>
        </el-form-item>

        <el-button
          type="primary"
          size="large"
          class="login-btn"
          :loading="loading"
          @click="handleLogin"
        >
          登 录
        </el-button>
      </el-form>
    </div>

    <p class="copyright">Copyright © 2026 OA企业工单管理系统 · 版权所有</p>
  </div>
</template>

<style scoped>
.login-page {
  /* 在页面内覆盖 Element Plus 主题色，统一为企业蓝 */
  --el-color-primary: #1e88e5;

  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 20px;
  overflow: hidden;
  background: linear-gradient(135deg, #eaf4fe 0%, #c2def7 100%);
}

/* 背景装饰圆 */
.bg-circle {
  position: absolute;
  border-radius: 50%;
  z-index: 0;
}
.circle-1 {
  width: 420px;
  height: 420px;
  top: -140px;
  left: -120px;
  background: rgba(30, 136, 229, 0.12);
}
.circle-2 {
  width: 320px;
  height: 320px;
  right: -90px;
  top: -80px;
  background: rgba(255, 255, 255, 0.55);
}
.circle-3 {
  width: 380px;
  height: 380px;
  right: 6%;
  bottom: -180px;
  background: rgba(30, 136, 229, 0.1);
}

/* 白色登录卡片 */
.login-card {
  position: relative;
  z-index: 1;
  width: 420px;
  max-width: 100%;
  padding: 42px 40px 36px;
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 16px 48px rgba(30, 100, 180, 0.18);
}

/* 头部 Logo 区域 */
.login-header {
  text-align: center;
  margin-bottom: 30px;
}
.logo {
  width: 68px;
  height: 68px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  border-radius: 18px;
  background: linear-gradient(135deg, #42a5f5 0%, #1e88e5 100%);
  box-shadow: 0 8px 18px rgba(30, 136, 229, 0.35);
}
.system-title {
  margin: 0;
  font-size: 23px;
  font-weight: 600;
  letter-spacing: 1px;
  color: #14487e;
}
.system-subtitle {
  margin: 8px 0 0;
  font-size: 11px;
  letter-spacing: 2px;
  color: #8fa9c2;
}

/* 表单 */
.login-form {
  margin-top: 8px;
}
.remember-item {
  margin-bottom: 18px;
}
.remember-item :deep(.el-form-item__content) {
  justify-content: flex-start;
}
.password-toggle {
  cursor: pointer;
  color: #9bb4cc;
}
.password-toggle:hover {
  color: #1e88e5;
}

/* 登录按钮 */
.login-btn {
  width: 100%;
  height: 44px;
  font-size: 16px;
  letter-spacing: 6px;
  border: none;
  background: linear-gradient(135deg, #42a5f5 0%, #1e88e5 100%);
  box-shadow: 0 6px 14px rgba(30, 136, 229, 0.32);
}
.login-btn:hover {
  background: linear-gradient(135deg, #5cb3f6 0%, #2190ee 100%);
}

/* 底部版权 */
.copyright {
  position: relative;
  z-index: 1;
  margin: 26px 0 0;
  font-size: 12px;
  color: #6f8aa5;
}
</style>
