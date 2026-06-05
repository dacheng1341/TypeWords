import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getUserInfo } from '../apis/user'
import type { User } from '../apis/user'
import { AppEnv } from '../config/env'
import { Toast } from '@typewords/base'

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  const isLogin = ref<boolean>(false)

  // 设置token
  const setToken = (newToken: string) => {
    isLogin.value = true
    AppEnv.TOKEN = newToken
    AppEnv.IS_LOGIN = !!AppEnv.TOKEN
    AppEnv.CAN_REQUEST = AppEnv.IS_LOGIN && AppEnv.IS_OFFICIAL
    localStorage.setItem('token', newToken)
  }

  // 清除token
  const clearToken = () => {
    AppEnv.IS_LOGIN = AppEnv.CAN_REQUEST = false
    AppEnv.TOKEN = ''
    localStorage.removeItem('token')
    isLogin.value = false
    user.value = null
  }

  // 设置用户信息
  const setUser = (userInfo: User) => {
    user.value = userInfo
    isLogin.value = true
  }

  // 登出
  function logout() {
    clearToken()
    Toast.success('已退出登录')
    //这行会引起hrm失效
    // router.push('/')
  }

  // 使用 dacbbox WordPress JWT 登录
  function loginWithDacbbox(token: string, displayName: string, email: string) {
    // 按需求将 token 存入指定键名
    localStorage.setItem('dacbbox_token', token)
    // 同步更新运行时环境
    AppEnv.TOKEN = token
    AppEnv.IS_LOGIN = true
    AppEnv.CAN_REQUEST = AppEnv.IS_OFFICIAL
    // 构造最简 User 对象更新响应式状态
    setUser({
      id: email,
      email,
      username: displayName,
      member: {
        levelDesc: '',
        status: '',
        active: false,
        endDate: 0,
        autoRenew: false,
        plan: '',
        planDesc: '',
      },
    })
  }

  // 同步游客本地记录到云端
  async function syncLocalRecordsToCloud() {
    // 1. 读取并解析本地缓存
    const raw = localStorage.getItem('dacbbox_guest_records')
    if (!raw) return

    let records: unknown[]
    try {
      records = JSON.parse(raw)
    } catch {
      return // 数据格式损坏，静默退出
    }
    if (!Array.isArray(records) || records.length === 0) return

    // 2. 读取登录 token
    const token = localStorage.getItem('dacbbox_token')
    if (!token) return

    // 3. 发起 POST 请求，Header 携带 Bearer Token
    try {
      await $fetch('https://dacbbox.com/wp-json/dacbbox/v1/save-typing-record', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: { records },
      })
      // 4. 成功：清除本地缓存并提示
      localStorage.removeItem('dacbbox_guest_records')
      Toast.success('本地打字数据已安全同步至云端')
    } catch (error) {
      // 5. 失败：保留本地缓存，提示用户，下次登录或手动重试
      console.error('[syncLocalRecordsToCloud] 同步失败，本地数据保留，下次登录时重试', error)
      Toast.warning('同步云端失败，成绩已保留在本地待重试')
    }
  }

  // 获取用户信息
  async function fetchUserInfo() {
    if (!AppEnv.CAN_REQUEST) return false
    try {
      const res = await getUserInfo()
      if (res.success) {
        setUser(res.data)
        return true
      }
      return false
    } catch (error) {
      console.error('Get user info error:', error)
      return false
    }
  }

  // 初始化用户状态
  async function init() {
    const success = await fetchUserInfo()
    if (!success) {
      clearToken()
    }
  }

  return {
    user,
    isLogin,
    setToken,
    clearToken,
    setUser,
    logout,
    fetchUserInfo,
    init,
    syncLocalRecordsToCloud,
    loginWithDacbbox,
  }
})
