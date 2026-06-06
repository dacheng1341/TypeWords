import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getUserInfo } from '../apis/user'
import type { User } from '../apis/user'
import { AppEnv, SAVE_DICT_KEY } from '../config/env'
import { Toast } from '@typewords/base'
import { useExport } from '../hooks/export'
import { get } from 'idb-keyval'
import { checkAndUpgradeSaveDict, checkAndUpgradeSaveSetting } from '../utils'
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

      // 【🔥核心修复 1】：强制同步当前活跃的选书状态（studyIndex），防止导出陈旧的 -1
      const baseStore = useBaseStore()
      if (backupData.val.dict.val.word && baseStore.word?.studyIndex !== undefined) {
        backupData.val.dict.val.word.studyIndex = baseStore.word.studyIndex
      }
      if (backupData.val.dict.val.article && baseStore.article?.studyIndex !== undefined) {
        backupData.val.dict.val.article.studyIndex = baseStore.article.studyIndex
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

      // 5. 成功：清理废弃的游客记录垃圾数据
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
    // ── 递归深度解包：剥除所有嵌套字符串包裹 ──────────────────────────────
    function deepUnwrap(val: any): any {
      if (typeof val === 'string') {
        const trimmed = val.trim()
        if (
          (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (trimmed.startsWith('[') && trimmed.endsWith(']'))
        ) {
          try {
            return deepUnwrap(JSON.parse(trimmed))
          } catch {
            return val
          }
        }
        return val
      }
      if (Array.isArray(val)) return val.map((item) => deepUnwrap(item))
      if (val !== null && typeof val === 'object') {
        const result: Record<string, any> = {}
        for (const key of Object.keys(val)) {
          result[key] = deepUnwrap(val[key])
        }
        return result
      }
      return val
    }
    // ──────────────────────────────────────────────────────────────────────
    try {
      // 1. 读取 WordPress JWT Token（强制鉴权）
      const token = localStorage.getItem('dacbbox_token')
      if (!token) {
        Toast.warning('请先登录后再拉取数据')
        return
      }
      // 2. GET 云端数据，显式注入 Bearer Token
      const res = await $fetch<{ success: boolean; backup_data: any }>(
        'https://dacbbox.com/wp-json/dacbbox/v1/get-learning-data',
        {
          headers: { Authorization: 'Bearer ' + token },
        }
      )
      console.group('%c[DIAG] fetchAndRestoreDataFromCloud - HTTP 原始响应', 'color:#0af;font-weight:bold')
      console.log('res (完整):', JSON.parse(JSON.stringify(res ?? null)))
      console.log('typeof res.backup_data:', typeof res?.backup_data)
      console.groupEnd()
      // 3. 用 deepUnwrap 对整个响应做彻底递归清洗，一次搞定所有嵌套
      const cleanedRes = deepUnwrap(res)
      const rawBackup = cleanedRes?.backup_data
      console.group('%c[DIAG] deepUnwrap 清洗后 rawBackup 结构', 'color:#0f9;font-weight:bold')
      console.log('rawBackup:', rawBackup)
      console.log('rawBackup.val keys:', rawBackup?.val ? Object.keys(rawBackup.val) : 'null')
      console.groupEnd()
      // 4. 校验：dict 是核心数据，必须存在
      const backupVal = rawBackup?.val
      const dictSaveData = backupVal?.dict
      const settingSaveData = backupVal?.setting
      if (!dictSaveData?.val) {
        Toast.warning('云端暂无学习数据，请先在其他设备同步一次')
        return
      }
      // 5. 版本升级兼容处理（数据已是纯净对象，直接传入）
      const dictState = await checkAndUpgradeSaveDict(dictSaveData)
      const settingState = settingSaveData?.val
        ? await checkAndUpgradeSaveSetting(settingSaveData)
        : getDefaultSettingState()
      // 6. 构造完整恢复对象，直接使用 deepUnwrap 清洗后的数据，无需任何额外猜测
      const dataToRestore = {
        ...backupVal,
        PracticeSaveArticle: backupVal?.PracticeSaveArticle,
        PracticeSaveWord: backupVal?.PracticeSaveWord,
        dict: { ...dictSaveData, val: dictState },
        setting: { ...(settingSaveData ?? {}), val: settingState },
      }
      console.group('%c[DIAG] dataToRestore - 即将写入 IndexedDB', 'color:#f55;font-weight:bold')
      console.log('dataToRestore keys:', Object.keys(dataToRestore))
      console.log('PracticeSaveArticle:', dataToRestore.PracticeSaveArticle)
      console.log('PracticeSaveWord:', dataToRestore.PracticeSaveWord)
      console.log(
        'PracticeSaveArticle?.val:',
        (dataToRestore as any)?.PracticeSaveArticle?.val ?? '⚠️ undefined'
      )
      console.groupEnd()
      // 7. 写入 IndexedDB（通过 dataSyncPersistence）
      const dataSyncPersistence = useDataSyncPersistence()
      await dataSyncPersistence.forcePushLocalDataToRemote(dataToRestore as any)
      // 8. 更新 Pinia 内存状态
      const baseStore = useBaseStore()
      const settingStore = useSettingStore()
      // 防御性合并：防止云端 -1 清空本地已选中的书本
      const localWordIndex = baseStore.word?.studyIndex ?? -1
      const localArticleIndex = baseStore.article?.studyIndex ?? -1
      if (dictState.word && dictState.word.studyIndex === -1 && localWordIndex !== -1) {
        dictState.word.studyIndex = localWordIndex
      }
      if (dictState.article && dictState.article.studyIndex === -1 && localArticleIndex !== -1) {
        dictState.article.studyIndex = localArticleIndex
      }
      settingStore.setState({ ...settingState, load: true })
      baseStore.setState({ ...dictState, load: true })
      Toast.success('云端数据已成功恢复至本地 ✓ 即将刷新…')
      // 延迟 1 秒刷新，确保底层数据覆盖完成
      setTimeout(() => window.location.reload(), 1000)
    } catch (error: any) {
      console.error('[fetchAndRestoreDataFromCloud] 恢复失败详情:', error)
      Toast.error(`拉取失败：${error?.message ?? '数据解析错误'}`)
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
