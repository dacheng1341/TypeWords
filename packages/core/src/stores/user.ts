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
import { useBaseStore } from './base'
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

  // 从云端拉取全量数据并恢复至本地（复现 setting.vue importJson 管线）
  async function fetchAndRestoreDataFromCloud() {
    try {
      // 1. 读取 WordPress JWT Token
      const token = localStorage.getItem('dacbbox_token')
      if (!token) {
        Toast.warning('请先登录后再拉取数据')
        return
      }

      // 2. GET 云端数据
      // 后端实际返回: { success: true, backup_data: { version, val: { dict: SaveData, setting: SaveData } } }
      const res = await $fetch<{ success: boolean; backup_data: BackupData }>(
        'https://dacbbox.com/wp-json/dacbbox/v1/get-learning-data',
        { headers: { Authorization: `Bearer ${token}` } }
      )

      // 3. 严格校验响应层级，防止后端结构异常时解析到 undefined 后覆盖本地数据
      const backupData = res?.backup_data
      const dictSaveData = backupData?.val?.dict
      const settingSaveData = backupData?.val?.setting

      if (!dictSaveData?.val) {
        Toast.warning('云端暂无学习数据，请先在其他设备同步一次')
        return
      }
      if (!settingSaveData?.val) {
        throw new Error('云端数据结构解析失败：setting 层级缺失')
      }

      // 4. 版本升级兼容处理（importJson 管线的步骤 ②③）
      const dictState    = await checkAndUpgradeSaveDict(dictSaveData)
      const settingState = await checkAndUpgradeSaveSetting(settingSaveData)

      // ── 强制防御：upgrade 失败时返回的空对象不得写入 IndexedDB ──
      if (!dictState) {
        throw new Error('云端数据结构解析失败：dict checkAndUpgrade 返回空值')
      }
      if (!settingState) {
        throw new Error('云端数据结构解析失败：setting checkAndUpgrade 返回空值')
      }

      // 5. 构造 BackupData['val'] 结构，写入 IndexedDB（importJson 管线的步骤 ④）
      //    注意：forcePushLocalDataToRemote 内部会取 data.dict.val / data.setting.val
      const dataToRestore: BackupData['val'] = {
        ...backupData.val,
        dict:    { ...dictSaveData,    val: dictState },
        setting: { ...settingSaveData, val: settingState },
      }

      const dataSyncPersistence = useDataSyncPersistence()
      await dataSyncPersistence.forcePushLocalDataToRemote(dataToRestore)

      // 6. 更新 Pinia 内存状态，界面立即响应（importJson 管线的步骤 ⑤⑥）
      const baseStore    = useBaseStore()
      const settingStore = useSettingStore()
      settingStore.setState({ ...settingState, load: true })
      baseStore.setState({ ...dictState, load: true })

      Toast.success('云端数据已成功恢复至本地 ✓')
    } catch (error: any) {
      console.error('[fetchAndRestoreDataFromCloud] 拉取失败', error)
      Toast.error(`拉取失败：${error?.message ?? '网络错误，请稍后重试'}`)
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
