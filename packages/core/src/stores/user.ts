import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getUserInfo } from '../apis/user'
import type { User } from '../apis/user'
import { AppEnv } from '../config/env'
import { Toast } from '@typewords/base'
import { useExport } from '../hooks/export'

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

  // 同步全量学习数据到云端（WordPress 后端）
  async function syncAllDataToCloud() {
    try {
      // 1. 打包全量数据（设置 + 词书/进度/FSRS遗忘曲线 + 单词练习缓存 + 文章练习缓存）
      const { getExportedData } = useExport()
      const backupData = await getExportedData()

      // 2. 空数据校验：dict 未初始化说明用户还未开始使用
      if (!backupData?.val?.dict?.val) {
        Toast.warning('暂无可同步的数据，请先开始练习')
        return
      }

      // 3. 读取 WordPress JWT Token
      const token = localStorage.getItem('dacbbox_token')
      if (!token) {
        Toast.warning('请先登录后再同步')
        return
      }

      // 4. POST 全量数据到 WordPress 新端点
      await $fetch('https://dacbbox.com/wp-json/dacbbox/v1/save-learning-data', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: { backup_data: backupData },
      })

      // 5. 成功：清理废弃的游客记录垃圾数据（不动 Pinia 和 IndexedDB 真实数据）
      localStorage.removeItem('dacbbox_guest_records')
      Toast.success('全量学习数据已成功同步至云端 ✓')
    } catch (error: any) {
      console.error('[syncAllDataToCloud] 同步失败', error)
      Toast.error(`同步失败：${error?.message ?? '网络错误，请稍后重试'}`)
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
    syncAllDataToCloud,
    loginWithDacbbox,
  }
})
