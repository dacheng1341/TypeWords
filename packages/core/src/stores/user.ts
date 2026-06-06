import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getUserInfo } from '../apis/user'
import type { User } from '../apis/user'
import { AppEnv, SAVE_DICT_KEY } from '../config/env'
import { Toast } from '@typewords/base'

import { get } from 'idb-keyval'
import { getZipBlobForCloud, importDataFromZipBlob, safeImportBlob } from '../hooks/export'
import { useDataSyncPersistence } from '../composables/useDataSyncPersistence'
import { getDefaultSettingState, useBaseStore } from './base'
import { useSettingStore } from './setting'

import type { BackupData } from '../types'

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

  // 登出（同时清理 dacbbox 登录态和用户信息）
  function logout() {
    clearToken()
    localStorage.removeItem('dacbbox_token')
    localStorage.removeItem('dacbbox_user')
    isLogin.value = false
    user.value = null
    Toast.success('已退出登录')
  }

  // 使用 dacbbox WordPress JWT 登录（主动登录，允许后续触发 Toast 和数据检查）
  function loginWithDacbbox(token: string, displayName: string, email: string) {
    // 按需求将 token 存入指定键名
    localStorage.setItem('dacbbox_token', token)
    // 同步持久化用户信息，供刷新后 restoreLoginState 读取
    localStorage.setItem('dacbbox_user', JSON.stringify({ displayName, email }))
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

  // 静默恢复登录态（仅用于页面刷新时从 localStorage 还原状态）
  // 不触发任何 Toast，不触发数据防覆盖检查，不做任何网络请求
  function restoreLoginState(): boolean {
    const token = localStorage.getItem('dacbbox_token')
    if (!token) return false
    let displayName = ''
    let email = ''
    try {
      const userInfo = JSON.parse(localStorage.getItem('dacbbox_user') ?? '{}')
      displayName = userInfo.displayName ?? ''
      email = userInfo.email ?? ''
    } catch {
      // dacbbox_user 解析失败时容错，继续用空字符串
    }
    // 仅恢复运行时环境和 Pinia 响应式状态，无任何副作用
    AppEnv.TOKEN = token
    AppEnv.IS_LOGIN = true
    AppEnv.CAN_REQUEST = AppEnv.IS_OFFICIAL
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
    return true
  }


  // ── 工具函数：Blob → Base64 字符串 ────────────────────────────────────────────
  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        // result 格式为 "data:application/zip;base64,XXXX..."，取逗号后面的纯 Base64 部分
        const result = reader.result as string
        resolve(result.split(',')[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }
  // ── 工具函数：Base64 字符串 → Blob ────────────────────────────────────────────
  function base64ToBlob(base64: string, mimeType = 'application/zip'): Blob {
    const byteCharacters = atob(base64)
    const byteNumbers = new Uint8Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    return new Blob([byteNumbers], { type: mimeType })
  }

  // 同步全量学习数据到云端（WordPress 后端）
  async function syncAllDataToCloud() {
    try {
      // 1. 读取 WordPress JWT Token
      const token = localStorage.getItem('dacbbox_token')
      if (!token) {
        Toast.warning('请先登录后再同步')
        return
      }
      // 2. 调用共享函数，打包轻量级 ZIP（仅含 data.json，绝不含 mp3）
      const zipBlob = await getZipBlobForCloud()
      // 3. ZIP Blob → Base64 字符串
      const base64 = await blobToBase64(zipBlob)
      // 4. 携带 Bearer Token，将 Base64 字符串作为 backup_data 字段上传
      await $fetch('https://dacbbox.com/wp-json/dacbbox/v1/save-learning-data', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: { backup_data: base64 },
      })
      // 5. 清理废弃的游客缓存，提示成功
      localStorage.removeItem('dacbbox_guest_records')
      Toast.success('全量学习数据已成功同步至云端 ✓')
    } catch (error: any) {
      console.error('[syncAllDataToCloud] 同步失败', error)
      Toast.error(`同步失败：${error?.message ?? '网络错误，请稍后重试'}`)
    }
  }


  // ── 私有辅助：判断本地是否存在有效学习进度（直接读 IndexedDB，避免 Pinia 时序问题）──
  async function hasLocalLearningData(): Promise<boolean> {
    // ① 连 dict key 都没有 = 纯新设备，从未运行过 TypeWords
    const raw = await get(SAVE_DICT_KEY.key)
    if (!raw) return false
    // ② 解析确认有实质进度（排除打开过但什么都没做的初始化空状态）
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


  // 从云端拉取全量数据并恢复至本地
  async function fetchAndRestoreDataFromCloud() {
    try {
      const token = localStorage.getItem('dacbbox_token')
      if (!token) return Toast.warning('请先登录')

      // 1. 获取云端数据
      const res = await $fetch<{ success: boolean; backup_data: string }>(
        'https://dacbbox.com/wp-json/dacbbox/v1/get-learning-data',
        { headers: { Authorization: 'Bearer ' + token } }
      )

      if (!res?.backup_data) return Toast.warning('云端暂无数据')

      // 2. 关键修复：这里的 backup_data 是 Base64 字符串，必须还原成二进制 ZIP
      // 使用你在 export.ts 里定义的 base64ToBlob 函数
      const zipBlob = base64ToBlob(res.backup_data, 'application/zip')

      // 3. 调用我们验证通过的 safeImportBlob (它会自动执行解压、入库、刷新)
      await safeImportBlob(zipBlob)

      Toast.success('云端数据已成功恢复至本地 ✓')
      setTimeout(() => window.location.reload(), 1500)
    } catch (error: any) {
      console.error('恢复失败:', error)
      Toast.error(`拉取失败：${error.message}`)
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
    fetchAndRestoreDataFromCloud,
    hasLocalLearningData,
    loginWithDacbbox,
    restoreLoginState,
  }
})
