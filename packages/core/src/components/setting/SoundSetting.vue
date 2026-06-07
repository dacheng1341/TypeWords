<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Option, Select, Slider, Switch, VolumeIcon } from '@typewords/base'
import SettingItem from './SettingItem.vue'
import { useSettingStore } from '../../stores/setting.ts'
import { ENV, SoundFileOptions } from '../../config/env.ts'
import { getBrowserKey, getAudioFileUrl, usePlayAudio, useTTsPlayAudio } from '../../hooks/sound.ts'

const settingStore = useSettingStore()

// ---- TTS 声色 ----
const ttsVoiceList = ref<SpeechSynthesisVoice[]>([])
// 用于在声色列表异步加载完成后强制重建 Select，使 modelValue watch 重新触发回显
const ttsSelectKey = ref(0)

onMounted(() => {
  if (typeof speechSynthesis === 'undefined') return
  const load = () => {
    ttsVoiceList.value = speechSynthesis
      .getVoices()
      .filter(v => v.lang.startsWith('en'))
      .sort((a, b) => (b.localService ? 0 : 1) - (a.localService ? 0 : 1))
    // 声色列表加载完毕后递增 key，强制 Select 重建，从而触发其内部 watch 重新匹配已保存的声色值
    ttsSelectKey.value++
  }
  load()
  speechSynthesis.onvoiceschanged = load
})

const browserKey = getBrowserKey()

const currentTtsVoice = computed({
  get() {
    return settingStore.ttsVoiceMap?.find(v => v.key === browserKey)?.voice ?? ''
  },
  set(voiceName: string) {
    const map = settingStore.ttsVoiceMap ? [...settingStore.ttsVoiceMap] : []
    const idx = map.findIndex(v => v.key === browserKey)
    if (idx >= 0) {
      map[idx] = { key: browserKey, voice: voiceName }
    } else {
      map.push({ key: browserKey, voice: voiceName })
    }
    settingStore.ttsVoiceMap = map
  },
})

let exampleText = 'How are you? I am fine, thank you. And you?'

function previewTtsVoice(voiceName: string) {
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.cancel()
  const msg = new SpeechSynthesisUtterance(exampleText)
  msg.lang = 'en-US'
  const voice = ttsVoiceList.value.find(v => v.name === voiceName)
  if (voice) msg.voice = voice
  speechSynthesis.speak(msg)
}

function previewNetworkTts() {
  const ttsPlay = useTTsPlayAudio()
  ttsPlay(exampleText)
}

function previewNetworkTtsVoice(voiceName: string) {
  // 不改变当前设置，直接试听某个特定发音人
  const baseUrl = 'https://qiaoqiao-tts.dacbbox.com/'
  const url = `${baseUrl}?text=${encodeURIComponent(exampleText)}&voice=${encodeURIComponent(voiceName)}`
  const audio = new Audio(url)
  audio.volume = settingStore.wordSoundVolume / 100
  audio.playbackRate = settingStore.wordSoundSpeed
  audio.play()
}
</script>

<template>
  <div>
    <!-- 单词发音 -->
    <SettingItem mainTitle="单词发音" />
    <SettingItem :title="$t('pronunciation_accent')" :desc="$t('pronunciation_accent_desc')">
      <Select v-model="settingStore.soundType" :placeholder="$t('please_select')" class="w-50!">
        <Option :label="$t('us_accent')" value="us" />
        <Option :label="$t('uk_accent')" value="uk" />
      </Select>
    </SettingItem>
    <SettingItem :title="$t('word_auto_pronunciation')">
      <Switch v-model="settingStore.wordSound" />
    </SettingItem>
    <SettingItem :title="$t('volume')">
      <Slider v-model="settingStore.wordSoundVolume" showText showValue unit="%" />
    </SettingItem>
    <SettingItem :title="$t('speed')">
      <Slider v-model="settingStore.wordSoundSpeed" :step="0.1" :min="0.5" :max="3" showText showValue />
    </SettingItem>


    <!-- TTS 声色 -->
    <div class="line"></div>
    <SettingItem mainTitle="TTS 声色" />
    <div class="flex items-center gap-2 mb-2">
      <div>试听句子：{{ exampleText }}</div>
      <VolumeIcon :time="100" @click="currentTtsVoice ? previewTtsVoice(currentTtsVoice) : previewTtsVoice('')" title="试听本地 TTS" />
    </div>
    <SettingItem
      title="TTS 声色"
      desc="例句使用浏览器内置 TTS 发音。若例句无声，请在此选择一个可用声色并点击右侧喇叭试听，选到有声音的即可。不同浏览器/设备支持的声色不同，此设置仅对当前浏览器生效。"
    >
      <Select
        :key="ttsSelectKey"
        v-model="currentTtsVoice"
        :placeholder="ttsVoiceList.length ? '请选择声色' : '浏览器暂无可用声色'"
        class="w-80!"
      >
        <Option v-for="voice in ttsVoiceList" :key="voice.name" :label="voice.name" :value="voice.name">
          <div class="flex justify-between items-center w-full">
            <span class="truncate">{{ voice.name + `（${voice.localService ? `本地` : ` 网络`}）` }}</span>
            <VolumeIcon :time="100" @click="previewTtsVoice(voice.name)" />
          </div>
        </Option>
      </Select>
    </SettingItem>
    <div v-if="!currentTtsVoice" class="text-sm text-orange-500 mt-1 mb-2">
      ⚠️ 当前未设置 TTS 声色，例句可能无法发音，建议逐个试听选择可用声色。
    </div>
    

    <!-- 网络超清 TTS -->
    <div class="line"></div>
    <SettingItem mainTitle="网络超清 TTS (推荐)" />
    
    <SettingItem title="开启超清发音" desc="使用网络接口，有极低延迟，但音质像真人。">
      <Switch v-model="settingStore.useNetworkTts" />
    </SettingItem>
    <template v-if="settingStore.useNetworkTts">
      <div class="flex items-center gap-2 mb-2 ml-4">
        <div>试听句子：{{ exampleText }}</div>
        <VolumeIcon :time="100" @click="previewNetworkTts" title="试听网络 TTS" />
      </div>
      <SettingItem title="发音人">
        <Select v-model="settingStore.networkTtsVoice" class="w-80!">
          <Option value="en-US-AriaNeural" label="美音 (女) - Aria">
            <div class="flex justify-between items-center w-full">
              <span>美音 (女) - Aria</span>
              <VolumeIcon :time="100" @click.stop="previewNetworkTtsVoice('en-US-AriaNeural')" title="试听 Aria" />
            </div>
          </Option>
          <Option value="en-US-GuyNeural" label="美音 (男) - Guy">
            <div class="flex justify-between items-center w-full">
              <span>美音 (男) - Guy</span>
              <VolumeIcon :time="100" @click.stop="previewNetworkTtsVoice('en-US-GuyNeural')" title="试听 Guy" />
            </div>
          </Option>
          <Option value="en-GB-SoniaNeural" label="英音 (女) - Sonia">
            <div class="flex justify-between items-center w-full">
              <span>英音 (女) - Sonia</span>
              <VolumeIcon :time="100" @click.stop="previewNetworkTtsVoice('en-GB-SoniaNeural')" title="试听 Sonia" />
            </div>
          </Option>
          <Option value="en-GB-RyanNeural" label="英音 (男) - Ryan">
            <div class="flex justify-between items-center w-full">
              <span>英音 (男) - Ryan</span>
              <VolumeIcon :time="100" @click.stop="previewNetworkTtsVoice('en-GB-RyanNeural')" title="试听 Ryan" />
            </div>
          </Option>
        </Select>
      </SettingItem>
    </template>

    <!-- 文章音效 -->
    <div class="line"></div>
    <SettingItem mainTitle="文章音效" />
    <SettingItem :title="$t('auto_play_sentence')">
      <Switch v-model="settingStore.articleSound" />
    </SettingItem>
    <SettingItem :title="$t('play_next_after_end')">
      <Switch v-model="settingStore.articleAutoPlayNext" />
    </SettingItem>
    <SettingItem title="音量">
      <Slider v-model="settingStore.articleSoundVolume" showText showValue unit="%" />
    </SettingItem>
    <SettingItem title="倍速">
      <Slider v-model="settingStore.articleSoundSpeed" :step="0.1" :min="0.5" :max="3" showText showValue />
    </SettingItem>

    <!-- 按键音效 -->
    <div class="line"></div>
    <SettingItem mainTitle="按键音效" />
    <SettingItem :title="$t('keyboard_sound')">
      <Switch v-model="settingStore.keyboardSound" />
    </SettingItem>
    <SettingItem :title="$t('keyboard_sound_effect')">
      <Select v-model="settingStore.keyboardSoundFile" :placeholder="$t('please_select')" class="w-50!">
        <Option v-for="item in SoundFileOptions" :key="item.value" :label="item.label" :value="item.value">
          <div class="flex justify-between items-center w-full">
            <span>{{ item.label }}</span>
            <VolumeIcon :time="100" @click="usePlayAudio(ENV.RESOURCE_URL + getAudioFileUrl(item.value)[0])" />
          </div>
        </Option>
      </Select>
    </SettingItem>
    <SettingItem :title="$t('volume')">
      <Slider v-model="settingStore.keyboardSoundVolume" showText showValue unit="%" />
    </SettingItem>

    <!-- 效果音 -->
    <div class="line"></div>
    <SettingItem mainTitle="效果音" />
    <SettingItem :title="$t('effect_sound')">
      <Switch v-model="settingStore.effectSound" />
    </SettingItem>
    <SettingItem title="音量">
      <Slider v-model="settingStore.effectSoundVolume" showText showValue unit="%" />
    </SettingItem>

  </div>
</template>

<style scoped lang="scss">
.line {
  border-bottom: 1px solid var(--color-line, #c4c3c3);
  margin: 0.8rem 0;
}
</style>
