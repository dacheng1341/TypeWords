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

  // 同步游客本地记录到云端（预留，待后续完善）
  async function syncLocalRecordsToCloud() {
    // TODO: 待后续完善。
    // 触发时机：用户登录成功后调用此函数。
    // 实现思路：
    //   1. 读取 localStorage.getItem('dacbbox_guest_records')，解析为数组
    //   2. 若数组为空或不存在，直接 return
    //   3. 批量调用后端 API（如 addStat）将记录逐条/批量上传
    //   4. 上传全部成功后，执行 localStorage.removeItem('dacbbox_guest_records') 清空本地缓存
    //   5. 上传失败时，保留本地缓存，下次登录时重试
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
  }
})
