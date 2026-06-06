<script setup lang="ts">
import { onMounted } from 'vue'
import { Toast } from '@typewords/base'
import { useUserStore } from '../stores/user'
import { getSystemTheme, listenToSystemThemeChange } from '../hooks/theme'
import { SAVE_DICT_KEY } from '../config/env'
import { get } from 'idb-keyval'

const userStore = useUserStore()

let loginUsername = $ref('')
let loginPassword = $ref('')
let loginLoading = $ref(false)
let theme = $ref('light')

onMounted(() => {
  theme = getSystemTheme()
  listenToSystemThemeChange(val => {
    theme = val
  })
})

// 判断本地是否有实质学习进度（直接读 IndexedDB 原始 key，避免 Pinia 时序问题）
async function hasLocalLearningData(): Promise<boolean> {
  const raw = await get(SAVE_DICT_KEY.key)
  if (!raw) return false
  try {
    const parsed = JSON.parse(raw as string)
    const state = parsed?.val
    if (!state) return false
    return (
      (state.word?.studyIndex ?? -1) >= 0 ||
      (state.article?.studyIndex ?? -1) >= 0 ||
      Object.keys(state.fsrsData ?? {}).length > 0 ||
      (state.word?.bookList ?? []).some((b: any) => b.words?.length > 0)
    )
  } catch {
    return false
  }
}

async function handleLogin() {
  if (!loginUsername.trim() || !loginPassword.trim()) {
    Toast.warning('请填写用户名和密码')
    return
  }
  loginLoading = true
  try {
    const res = await $fetch<{ token: string; user_display_name: string; user_email: string }>(
      'https://dacbbox.com/wp-json/jwt-auth/v1/token',
      { method: 'POST', body: { username: loginUsername, password: loginPassword } }
    )
    userStore.loginWithDacbbox(res.token, res.user_display_name, res.user_email)
    userStore.showGlobalLoginModal = false
    Toast.success('登录成功 🎉')
    loginUsername = ''
    loginPassword = ''

    // ── 智能判断：防止新旧设备数据互相覆盖 ──
    const localHasData = await hasLocalLearningData()
    if (!localHasData) {
      // 新设备 / 空设备 → 自动从云端拉取恢复
      void userStore.fetchAndRestoreDataFromCloud()
    } else {
      // 本地有进度 → 不自动操作，提示用户手动决策
      Toast.info(
        '检测到本地存在学习记录，请点击手动选择「☁️ 同步数据到云端」或「⬇️ 从云端恢复」',
        { duration: 5000 }
      )
    }
  } catch {
    Toast.error('登录失败，请检查用户名或密码')
  } finally {
    loginLoading = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="login-modal">
      <div
        v-if="userStore.showGlobalLoginModal"
        id="login-modal-overlay"
        class="login-modal-overlay"
        @click.self="userStore.showGlobalLoginModal = false"
      >
        <div class="login-modal-card" :class="theme">
          <!-- 关闭按钮 -->
          <button class="login-modal-close" @click="userStore.showGlobalLoginModal = false" title="关闭">×</button>

          <!-- 标题区 -->
          <div class="login-modal-header">
            <div class="login-modal-logo">🔑</div>
            <h2 class="login-modal-title">欢迎回来</h2>
            <p class="login-modal-sub">登录你的大程开源百宝箱账号</p>
          </div>

          <!-- 表单区 -->
          <div class="login-modal-form">
            <div class="login-field">
              <label class="login-label" for="login-username">用户名</label>
              <input
                id="login-username"
                v-model="loginUsername"
                type="text"
                class="login-input"
                placeholder="请输入用户名"
                autocomplete="username"
                @keydown.enter="handleLogin"
              />
            </div>
            <div class="login-field">
              <label class="login-label" for="login-password">密码</label>
              <input
                id="login-password"
                v-model="loginPassword"
                type="password"
                class="login-input"
                placeholder="请输入密码"
                autocomplete="current-password"
                @keydown.enter="handleLogin"
              />
            </div>

            <button
              id="btn-confirm-login"
              class="login-submit-btn"
              :class="{ 'loading': loginLoading }"
              :disabled="loginLoading"
              @click="handleLogin"
            >
              <span v-if="loginLoading" class="login-spinner"></span>
              <span>{{ loginLoading ? '登录中…' : '确认登录' }}</span>
            </button>

            <!-- 分隔线 -->
            <div class="login-divider">
              <span class="login-divider-line"></span>
              <span class="login-divider-text">或</span>
              <span class="login-divider-line"></span>
            </div>

            <!-- 第三方登录入口 -->
            <a
              id="btn-third-party-login"
              href="https://dacbbox.com/wp-login.php?redirect_to=https://type.dacbbox.com"
              target="_blank"
              rel="noopener noreferrer"
              class="login-oauth-btn"
            >
              <!-- Google 图标 SVG -->
              <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.5 20-21 0-1.4-.2-2.7-.5-4z" fill="#FFC107"/>
                <path d="M6.3 14.7l7 5.1C15 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3c-7.6 0-14.2 4.2-17.7 10.4-.5.7-.7 1.5-1 2.3z" fill="#FF3D00"/>
                <path d="M24 45c5.5 0 10.4-1.9 14.3-5l-6.6-5.6C29.6 36 26.9 37 24 37c-6.1 0-10.7-3.1-11.8-7.5l-7 5.4C8.3 41.2 15.6 45 24 45z" fill="#4CAF50"/>
                <path d="M44.5 20H24v8.5h11.8c-.8 2.4-2.3 4.5-4.3 6l6.6 5.6C42 36.8 45 31 45 24c0-1.4-.2-2.7-.5-4z" fill="#1976D2"/>
              </svg>
              使用 Google 或其他方式登录
            </a>

            <p class="login-modal-tip">
              没有账号？
              <a href="https://dacbbox.com/wp-login.php?action=register" target="_blank" class="login-link">前往注册</a>
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Vue Transition 动画 */
.login-modal-enter-active,
.login-modal-leave-active {
  transition: opacity 0.22s ease;
}
.login-modal-enter-active .login-modal-card,
.login-modal-leave-active .login-modal-card {
  transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.22s ease;
}
.login-modal-enter-from,
.login-modal-leave-to {
  opacity: 0;
}
.login-modal-enter-from .login-modal-card {
  transform: translateY(24px) scale(0.96);
  opacity: 0;
}
.login-modal-leave-to .login-modal-card {
  transform: translateY(12px) scale(0.97);
  opacity: 0;
}

/* 覆盖层 */
.login-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

/* 弹窗卡片 */
.login-modal-card {
  position: relative;
  width: 100%;
  max-width: 400px;
  background: #ffffff;
  border-radius: 1.25rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  padding: 2.5rem 2rem;
  overflow: hidden;
}
.login-modal-card.dark {
  background: #171d26;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

/* 关闭按钮 */
.login-modal-close {
  position: absolute;
  top: 1rem;
  right: 1.2rem;
  background: transparent;
  border: none;
  font-size: 1.8rem;
  color: #aab0bc;
  cursor: pointer;
  line-height: 1;
  transition: color 0.2s, transform 0.2s;
}
.login-modal-close:hover {
  color: #ef4444;
  transform: rotate(90deg);
}

/* 标题区 */
.login-modal-header {
  text-align: center;
  margin-bottom: 2rem;
}
.login-modal-logo {
  font-size: 2.8rem;
  line-height: 1;
  margin-bottom: 0.8rem;
  display: inline-block;
  animation: float-logo 3s ease-in-out infinite;
}
@keyframes float-logo {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
.login-modal-title {
  font-size: 1.4rem;
  font-weight: 700;
  margin: 0 0 0.4rem 0;
  color: #0d0d0d;
}
.login-modal-card.dark .login-modal-title {
  color: #e8eaf0;
}
.login-modal-sub {
  font-size: 0.85rem;
  color: #72839f;
  margin: 0;
}

/* 表单区 */
.login-modal-form {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}
.login-field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.login-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #555e6e;
  margin-left: 0.2rem;
}
.login-modal-card.dark .login-label {
  color: #8a93a8;
}
.login-input {
  width: 100%;
  height: 2.8rem;
  border: 1.5px solid #e2e4e8;
  border-radius: 0.7rem;
  padding: 0 1rem;
  font-size: 0.95rem;
  background: #f8f9fa;
  color: #0d0d0d;
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
}
.login-modal-card.dark .login-input {
  background: #0e1217;
  border-color: #2a3140;
  color: #e8eaf0;
}
.login-input:focus {
  outline: none;
  border-color: #7c3aed;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.15);
}
.login-modal-card.dark .login-input:focus {
  background: #171d26;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.25);
}

/* 提交按钮 */
.login-submit-btn {
  width: 100%;
  height: 2.8rem;
  margin-top: 0.4rem;
  border: none;
  border-radius: 0.7rem;
  background: linear-gradient(135deg, #7c3aed, #2563eb);
  color: #ffffff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: transform 0.15s, box-shadow 0.2s, opacity 0.2s;
  box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);
}
.login-submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(124, 58, 237, 0.4);
}
.login-submit-btn:active:not(:disabled) {
  transform: translateY(0);
}
.login-submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
.login-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: login-spin 0.8s linear infinite;
}
@keyframes login-spin {
  to { transform: rotate(360deg); }
}

/* 分隔线 */
.login-divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.15rem 0;
}
.login-divider-line {
  flex: 1;
  height: 1px;
  background: #e2e4e8;
}
.login-modal-card.dark .login-divider-line {
  background: #2a3140;
}
.login-divider-text {
  font-size: 0.78rem;
  color: #aab0bc;
  white-space: nowrap;
  user-select: none;
}

/* 第三方登录按钮 */
.login-oauth-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  width: 100%;
  height: 2.6rem;
  border-radius: 0.7rem;
  border: 1.5px solid #e2e4e8;
  background: #ffffff;
  color: #555e6e;
  font-size: 0.88rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s, color 0.18s, box-shadow 0.18s, transform 0.15s;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  letter-spacing: 0.01em;
  box-sizing: border-box;
}
.login-modal-card.dark .login-oauth-btn {
  background: #0e1217;
  border-color: #2a3140;
  color: #8a93a8;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
}
.login-oauth-btn:hover {
  border-color: #7c3aed;
  color: #7c3aed;
  background: rgba(124, 58, 237, 0.04);
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
  transform: translateY(-1px);
}
.login-modal-card.dark .login-oauth-btn:hover {
  background: rgba(124, 58, 237, 0.08);
}
.login-oauth-btn svg {
  flex-shrink: 0;
}

/* 底部提示 */
.login-modal-tip {
  text-align: center;
  font-size: 0.85rem;
  color: #72839f;
  margin: 0.5rem 0 0 0;
}
.login-link {
  color: #7c3aed;
  font-weight: 600;
  text-decoration: none;
}
.login-link:hover {
  text-decoration: underline;
}
</style>
