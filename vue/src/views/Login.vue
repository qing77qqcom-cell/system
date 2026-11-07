<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { login } from '@/api/user'
import { useAuthStore } from '@/stores/store.js'
import { useLoading } from '@/composables/useLoading.js'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const formEl = ref(null)
const passwordVisible = ref(false)
const { loading, run } = useLoading()

const loginForm = reactive({
  username: '',
  password: '',
  remember: false,
})

// 每个字段的错误提示（原生校验失败时赋值，显示在 input 下方）
const fieldErrors = reactive({
  username: '',
  password: '',
})

// —— 原生校验：用 HTML5 原生属性 + 额外规则，替代 el-form 的 rules ——
function validateField(name) {
  fieldErrors[name] = ''
  const v = loginForm[name]
  if (name === 'username') {
    if (!v.trim()) fieldErrors.username = '请输入账号'
  } else if (name === 'password') {
    if (!v) fieldErrors.password = '请输入密码'
    else if (v.length < 6) fieldErrors.password = '密码长度不能少于 6 位'
  }
  return !fieldErrors[name]
}

function validateAll() {
  const ok1 = validateField('username')
  const ok2 = validateField('password')
  return ok1 && ok2
}

function onBlur(name) {
  validateField(name)
}

function onInput(name) {
  // 用户修正错误时立即清掉错误提示
  if (fieldErrors[name]) validateField(name)
}

// —— 登录 ——
async function handleLogin(e) {
  if (e) e.preventDefault()
  if (loading.value) return

  if (!validateAll()) return

  try {
    const { token, user } = await run(() => login(loginForm))
    auth.setAuth({ token, user })
    await auth.loadPermissions()
    ElMessage.success(`登录成功，欢迎回来，${user.name}！`)
    router.push(route.query.redirect || '/workbench')
  } catch (err) {
    // 错误提示：优先用后端返回的 message，否则兜底
    const msg = err?.response?.data?.message || err?.message || '登录失败，请稍后重试'
    ElMessage.error(msg)
  }
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
          <!-- Tickets 图标：简化成公文包 + 勾 -->
          <svg class="logo-icon" viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M9 13l2 2 4-4" />
          </svg>
        </div>
        <h1 class="system-title">OA企业工单管理系统</h1>
        <p class="system-subtitle">ENTERPRISE WORK ORDER SYSTEM</p>
      </div>

      <!-- 原生登录表单 -->
      <form ref="formEl" class="login-form" @submit="handleLogin" novalidate>

        <!-- 账号 -->
        <div class="form-item">
          <label class="input-wrap" :class="{ 'has-error': fieldErrors.username }">
            <span class="input-prefix" aria-hidden="true">
              <!-- User 图标 -->
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <input
              type="text"
              class="input"
              v-model="loginForm.username"
              placeholder="请输入账号"
              autocomplete="username"
              @blur="onBlur('username')"
              @input="onInput('username')"
            />
            <button v-if="loginForm.username" type="button" class="input-suffix clear-btn" @click="loginForm.username = ''" aria-label="清除">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </button>
          </label>
          <p v-if="fieldErrors.username" class="form-error">{{ fieldErrors.username }}</p>
        </div>

        <!-- 密码 -->
        <div class="form-item">
          <label class="input-wrap" :class="{ 'has-error': fieldErrors.password }">
            <span class="input-prefix" aria-hidden="true">
              <!-- Lock 图标 -->
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <input
              :type="passwordVisible ? 'text' : 'password'"
              class="input"
              v-model="loginForm.password"
              placeholder="请输入密码"
              autocomplete="current-password"
              @blur="onBlur('password')"
              @input="onInput('password')"
            />
            <button type="button" class="input-suffix toggle-btn" @click="passwordVisible = !passwordVisible" :aria-label="passwordVisible ? '隐藏密码' : '显示密码'">
              <!-- View / Hide：用 v-if/v-else 切换 -->
              <template v-if="passwordVisible">
                <!-- Hide 图标（眼睛斜杠） -->
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.77 21.77 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.77 21.77 0 0 1-3.17 4.19" />
                  <path d="M14.12 14.12A3 3 0 0 1 9.88 9.88" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </template>
              <template v-else>
                <!-- View 图标（眼睛） -->
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </template>
            </button>
          </label>
          <p v-if="fieldErrors.password" class="form-error">{{ fieldErrors.password }}</p>
        </div>

        <!-- 记住我 -->
        <div class="form-item remember-item">
          <label class="checkbox">
            <input type="checkbox" v-model="loginForm.remember" />
            <span class="checkbox-box" aria-hidden="true">
              <svg v-if="loginForm.remember" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12l5 5L20 7" />
              </svg>
            </span>
            <span class="checkbox-label">记住我</span>
          </label>
        </div>

        <!-- 登录按钮 -->
        <button type="submit" class="login-btn" :disabled="loading">
          <span v-if="loading" class="spinner" aria-hidden="true"></span>
          <span class="btn-text">{{ loading ? '登录中…' : '登 录' }}</span>
        </button>
      </form>
    </div>

    <p class="copyright">Copyright © 2026 OA企业工单管理系统 · 版权所有</p>
  </div>
</template>

<style scoped>
/* =========================================================
 * TODO: 这里的样式全部由你来写！
 *
 * 给一些类名提示（已经在 template 里用好了，你直接写就行）：
 *
 *   容器层:  .login-page  .bg-circle .circle-1/2/3
 *   卡片:    .login-card
 *   头部:    .login-header  .logo  .logo-icon  .system-title  .system-subtitle
 *   表单:    .login-form  .form-item  .form-error
 *   输入框:  .input-wrap  .input-wrap.has-error  .input  .input-prefix  .input-suffix
 *            .clear-btn  .toggle-btn
 *   复选框:  .checkbox  .checkbox-box  .checkbox-label
 *   按钮:    .login-btn  .login-btn:disabled  .spinner  .btn-text
 *   底部:    .copyright
 *
 * 想加动画? 试试:  @keyframes shake / @keyframes spin / transition / :focus-visible
 * 想加响应式?  试试:  @media (max-width: 480px)
 * ========================================================= */

 /* 最外层容器 */
 .login-page {
   position: relative;       /* 👈 加这行：创建层叠上下文，让子元素 z-index 生效 */
   display: flex;
  flex-direction: column;    /* 子项目竖排：装饰圆 → 卡片 → 版权 */
  justify-content: center;   /* 主轴（垂直）居中 → 卡片上下居中 */
  align-items: center;       /* 交叉轴（水平）居中 → 卡片左右居中 */
  min-height: 100vh;
  overflow: hidden;
  background: linear-gradient(-180deg, #cae3ff, #8ec9ff);

}
.bg-circle {
  position: absolute;
  z-index: 0;                /* 👈 从 -1 改成 0：负数会被父元素背景盖住 */
  border-radius: 50%;
  /* 模糊+透明，让圆像柔光斑点，不抢卡片风头 */
  filter: blur(4px);
  pointer-events: none;      /* 👈 加这行：装饰圆不挡鼠标点击事件 */
}

/* 左上：大一点的蓝色圆，半透明 */
.circle-1 {
  width: 420px;
  height: 420px;
  top: -140px;
  left: -120px;
  background: rgba(30, 136, 229, 0.18);
}

/* 右上：白色圆，制造云朵感 */
.circle-2 {
  width: 320px;
  height: 320px;
  top: -80px;
  right: -90px;
  background: rgba(255, 255, 255, 0.55);
}

/* 右下：中蓝圆，和左上呼应 */
.circle-3 {
  width: 380px;
  height: 380px;
  bottom: -180px;
  right: 6%;
  background: rgba(30, 136, 229, 0.12);
}

/* —— 白色卡片 —— */
.login-card {
  position: relative;
  z-index: 1;                    /* 浮在装饰圆之上 */
  width: 420px;
  max-width: 100%;               /* 手机上不超出屏幕 */
  padding: 42px 40px 36px;       /* 上宽下窄，让内容不贴边 */
  background: #ffffff;
  border-radius: 14px;
  /* 多层阴影：外层大阴影制造悬浮感 */
  box-shadow: 0 16px 48px rgba(30, 100, 180, 0.18);
  /* hover 时轻微上浮 + 阴影加深（鼠标移到卡片上） */
  transition: transform 0.3s ease, box-shadow 0.3s ease; /* 定义动画播放效果 */
}
.login-card:hover {
  transform: translateY(-2px); /* 定义动画内容 */
  box-shadow: 0 20px 56px rgba(30, 100, 180, 0.24);
}

/* —— 卡片头部 —— */
.login-header {
  text-align: center;
  margin-bottom: 30px;
}
.logo {
  width: 68px;
  height: 68px;
  margin: 0 auto 16px;
  display: flex;                  /* Flex 让 SVG 图标居中 */
  align-items: center;
  justify-content: center;
  color: #fff;
  border-radius: 18px;
  background: linear-gradient(135deg, #42a5f5 0%, #1e88e5 100%);
  box-shadow: 0 8px 18px rgba(30, 136, 229, 0.35);
}
.logo-icon {
  /* SVG 继承父级 color:#fff */
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
.login-form {
  margin: 0 auto;
  width: 100%;
  max-width: 320px;
}

/* —— 表单字段行 —— */
.form-item {
  margin-bottom: 18px;
}
.remember-item {
  margin-bottom: 20px;
}

/* —— 输入框外包裹（三段拼接：前缀 | input | 后缀） —— */
.input-wrap {
  display: flex;
  align-items: center;
  height: 44px;
  background: #fff;
  border: 1px solid #d8e2ee;
  border-radius: 8px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.input-wrap:focus-within {
  border-color: #1e88e5;
  box-shadow: 0 0 0 3px rgba(30, 136, 229, 0.12);
}
.input-wrap.has-error {
  border-color: #f56c6c;
}
.input-wrap.has-error:focus-within {
  box-shadow: 0 0 0 3px rgba(245, 108, 108, 0.15);
  animation: shake 0.35s ease-in-out;
}

/* —— 前缀图标槽 —— */
.input-prefix {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 100%;
  color: #9bb4cc;
  flex-shrink: 0;
}

/* —— 后缀槽（清除/显隐按钮） —— */
.input-suffix {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 100%;
  flex-shrink: 0;
}
.clear-btn,
.toggle-btn {
  all: unset;           /* 干掉 button 默认样式 */
  cursor: pointer;
  color: #9bb4cc;
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: 4px;
  transition: color 0.2s, background 0.2s;
}
.clear-btn:hover,
.toggle-btn:hover {
  color: #1e88e5;
  background: rgba(30, 136, 229, 0.08);
}

/* —— 原生 input（样式全部交给父容器） —— */
.input {
  flex: 1;
  width: 0;             /* flex 子项防溢出 */
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #2c3e50;
}
.input::placeholder {
  color: #b0c0d0;
}

/* —— 错误提示文字 —— */
.form-error {
  margin: 6px 2px 0;
  font-size: 12px;
  color: #f56c6c;
  line-height: 1.4;
}

/* —— 复选框（记住我） —— */
.checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: #5a7a96;
  user-select: none;
}
.checkbox input[type="checkbox"] {
  /* 隐藏原生 checkbox 但保留可聚焦/可点击 */
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
.checkbox-box {
  width: 16px;
  height: 16px;
  border: 1.5px solid #b0c0d0;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: #fff;            /* 选中后 .checkbox 继承的白色 */
  transition: background 0.2s, border-color 0.2s, transform 0.15s;
  flex-shrink: 0;
}
/* 选中态：相邻兄弟选择器 —— input:checked 后面的 .checkbox-box */
.checkbox input[type="checkbox"]:checked + .checkbox-box {
  background: #1e88e5;
  border-color: #1e88e5;
}
/* 键盘聚焦态（Tab 键导航） */
.checkbox input[type="checkbox"]:focus-visible + .checkbox-box {
  box-shadow: 0 0 0 2px rgba(30, 136, 229, 0.25);
}
.checkbox input[type="checkbox"]:checked + .checkbox-box svg {
  color: #fff;
  animation: pop 0.2s ease-out;
}
.checkbox-label {
  line-height: 1;
}

/* —— 登录按钮 —— */
.login-btn {
  position: relative;
  width: 100%;
  height: 44px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #42a5f5 0%, #1e88e5 100%);
  color: #fff;
  font-size: 15px;
  letter-spacing: 6px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 6px 14px rgba(30, 136, 229, 0.32);
  transition: transform 0.15s, box-shadow 0.2s, opacity 0.2s;
}
.login-btn:hover:not(:disabled) {
  box-shadow: 0 8px 18px rgba(30, 136, 229, 0.4);
}
.login-btn:active:not(:disabled) {
  transform: scale(0.98);
}
.login-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

/* —— 按钮里的 loading spinner —— */
.spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 18px;
  height: 18px;
  margin: -9px 0 0 -9px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.btn-text {
  /* loading 时视觉上被 spinner 盖住，但这里保留占位 */
}

/* —— 底部版权 —— */
.copyright {
  position: relative;
  z-index: 1;
  margin: 24px 0 0;
  font-size: 12px;
  color: #6f8aa5;
  text-align: center;
}

/* —— 动画 —— */
@keyframes spin {
  to { transform: rotate(360deg); }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(5px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(3px); }
}
@keyframes pop {
  0% { transform: scale(0.5); opacity: 0; }
  60% { transform: scale(1.15); }
  100% { transform: scale(1); opacity: 1; }
}

/* —— 响应式：手机 —— */
@media (max-width: 480px) {
  .login-card {
    padding: 32px 24px 28px;
    border-radius: 12px;
  }
  .system-title { font-size: 20px; }
  .system-subtitle { font-size: 10px; letter-spacing: 1.5px; }
  .login-form { max-width: 100%; }
  .bg-circle { filter: blur(6px); opacity: 0.8; }
  .circle-1 { width: 280px; height: 280px; }
  .circle-2 { width: 200px; height: 200px; }
  .circle-3 { width: 240px; height: 240px; }
}

</style>
