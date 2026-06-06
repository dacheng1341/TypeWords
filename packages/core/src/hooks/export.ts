import { checkAndUpgradeSaveDict, checkAndUpgradeSaveSetting, isEmpty, loadJsLib, shakeCommonDict } from '../utils'
import { useDataSyncPersistence } from '../composables/useDataSyncPersistence'
import {
  APP_NAME,
  APP_VERSION,
  EXPORT_DATA_KEY,
  LIB_JS_URL,
  LOCAL_FILE_KEY,
  SAVE_DICT_KEY,
  SAVE_SETTING_KEY,
} from '../config/env'
import { get } from 'idb-keyval'
import saveAs from 'file-saver'
import dayjs from 'dayjs'
import { Toast } from '@typewords/base'
import { useBaseStore } from '../stores/base'
import { useSettingStore } from '../stores/setting'
import { useRuntimeStore } from '../stores/runtime'
import { ref } from 'vue'
import { PRACTICE_ARTICLE_CACHE, PRACTICE_WORD_CACHE } from '../utils/cache'
import { usePracticeArticlePersistence, usePracticeWordPersistence } from '../composables/usePracticePersistence.ts'
import { Supabase } from '../utils/supabase'
import type { BackupData } from '../types'

export function useExport() {
  const store = useBaseStore()
  const settingStore = useSettingStore()

  let loading = ref(false)

  async function getExportedData() {
    const wordPersistence = usePracticeWordPersistence()
    const articlePersistence = usePracticeArticlePersistence()

    let data: BackupData = {
      version: EXPORT_DATA_KEY.version,
      val: {
        setting: {
          version: SAVE_SETTING_KEY.version,
          val: settingStore.$state,
        },
        dict: {
          version: SAVE_DICT_KEY.version,
          val: shakeCommonDict(store.$state),
        },
        [PRACTICE_WORD_CACHE.key]: {
          version: PRACTICE_WORD_CACHE.version,
          val: {},
        },
        [PRACTICE_ARTICLE_CACHE.key]: {
          version: PRACTICE_ARTICLE_CACHE.version,
          val: {},
        },
      },
    }
    let d = await wordPersistence.getLocalDataCompact()
    if (d) {
      data.val[PRACTICE_WORD_CACHE.key].val = d
    }
    let d1 = await articlePersistence.getLocalDataCompact()
    if (d1) {
      data.val[PRACTICE_ARTICLE_CACHE.key].val = d1
    }
    return data
  }

  async function exportData(
    notice = '导出成功！',
    fileName = `${APP_NAME}-User-Data-${dayjs().format('YYYY-MM-DD HH-mm-ss')}.zip`
  ) {
    if (loading.value) return
    loading.value = true

    try {
      const JSZip = await loadJsLib('JSZip', LIB_JS_URL.JSZIP)

      const zip = new JSZip()
      zip.file('data.json', JSON.stringify(await getExportedData()))
      const mp3 = zip.folder('mp3')
      const allRecords = await get(LOCAL_FILE_KEY)
      for (const rec of allRecords ?? []) {
        mp3.file(rec.id + '.mp3', rec.file)
      }
      let content = await zip.generateAsync({ type: 'blob' })
      saveAs(content, fileName)
      notice && Toast.success(notice)
      return content
    } catch (e: any) {
      Toast.error(e?.message || e || '导出失败')
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    exportData,
    getExportedData
  }
}

/**
 * 【云端专用】将全量数据打包为轻量级 ZIP Blob。
 * 仅包含 data.json，坚决不打包任何音频/媒体文件，确保传输体积安全。
 */
export async function getZipBlobForCloud(): Promise<Blob> {
  const { getExportedData } = useExport()
  const data = await getExportedData()

  const JSZip = await loadJsLib('JSZip', LIB_JS_URL.JSZIP)
  const zip = new JSZip()
  // 仅打包纯文本数据，绝不包含 mp3/ 目录
  zip.file('data.json', JSON.stringify(data))
  return await zip.generateAsync({ type: 'blob' })
}

/**
 * 【云端专用】将 ZIP Blob 解包并恢复数据到本地。
 * 完整复刻 setting.vue importJson 的核心逻辑：
 *   - 版本升级（checkAndUpgrade*）
 *   - v4 老版本兼容 shim
 *   - Supabase.check() 在 forcePush 之前调用（push 可能报错）
 *   - runtimeStore.globalLoading 开关
 *   - runtimeStore.isNew 判断
 *   - settingStore / baseStore 的 setState（load: true）
 * 不含任何 UI 绑定变量（importLoading / showBackupGate 等）。
 *
 * @param zipBlob - 由云端 Base64 转回的原始 ZIP Blob
 */
export async function importDataFromZipBlob(zipBlob: Blob): Promise<void> {
  const JSZip = await loadJsLib('JSZip', LIB_JS_URL.JSZIP)
  const zip = await JSZip.loadAsync(zipBlob)

  // 1. 读取 data.json（云端 ZIP 不含 mp3，无需处理音频）
  const dataFile = zip.file('data.json')
  if (!dataFile) {
    throw new Error('ZIP 中缺少 data.json，数据可能已损坏')
  }
  const str = await dataFile.async('string')

  // 2. 解析 BackupData 对象（唯一的 JSON.parse 调用点）
  const obj: BackupData = JSON.parse(str)
  const data = obj.val

  // 3. 版本升级兼容处理
  data.dict.val = await checkAndUpgradeSaveDict(data.dict)
  data.setting.val = await checkAndUpgradeSaveSetting(data.setting)

  // 4. 老版本 v4 兼容：将顶层 APP_VERSION.key 字段合并进 setting.val
  if (obj.version === 4) {
    if (!isEmpty(data?.[APP_VERSION.key])) {
      data.setting.val.webAppVersion = data?.[APP_VERSION.key]
    }
  }

  // 5. 在调用同步方法前先检查 Supabase 状态（同步方法可能报错，需提前记录）
  const hasRemote = Supabase.check()

  // 6. 写入 IndexedDB + 推送 Supabase（若已配置）
  const runtimeStore = useRuntimeStore()
  const dataSyncPersistence = useDataSyncPersistence()
  runtimeStore.globalLoading = true
  await dataSyncPersistence.forcePushLocalDataToRemote(data)
  runtimeStore.globalLoading = false

  // 7. 更新 runtimeStore.isNew：当前版本 > 备份中记录的版本时，提示有更新内容
  runtimeStore.isNew = APP_VERSION.version > Number(data.setting?.val?.webAppVersion ?? APP_VERSION.version)

  // 8. 更新 Pinia 内存状态，确保 UI 立即响应（setState 后 Promise resolve，
  //    外部调用方可安全执行 reload，此时 IndexedDB 已持久化完毕）
  const settingStore = useSettingStore()
  const baseStore = useBaseStore()
  data.setting.val.load = true
  settingStore.setState(data.setting.val)
  data.dict.val.load = true
  baseStore.setState(data.dict.val)
}
// 临时测试开关，仅供验证使用
if (typeof window !== 'undefined') {
  (window as any).testImport = importDataFromZipBlob;
}