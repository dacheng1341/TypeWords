import { onMounted, watchEffect } from 'vue'
import { useSettingStore } from '../stores/setting'
import { ref } from 'vue'

import { ENV, PronunciationApi, SoundFileOptions } from '../config/env'

/**
 * 获取当前浏览器的 OS+浏览器 组合 key，用于 ttsVoiceMap 的索引
 * 返回如 "mac+chrome" / "windows+edge" / "ios+safari" 等固定组合
 */
export function getBrowserKey(): string {
  if (typeof navigator === 'undefined') return 'unknown+unknown'
  const ua = navigator.userAgent

  let os = 'unknown'
  if (/iPad|iPhone|iPod/.test(ua)) {
    os = 'ios'
  } else if (/Android/.test(ua)) {
    os = 'android'
  } else if (/Macintosh|Mac OS X/.test(ua)) {
    os = 'mac'
  } else if (/Windows/.test(ua)) {
    os = 'windows'
  } else if (/Linux/.test(ua)) {
    os = 'linux'
  }

  let browser = 'unknown'
  if (/Edg\//.test(ua)) {
    browser = 'edge'
  } else if (/OPR\/|Opera/.test(ua)) {
    browser = 'opera'
  } else if (/Chrome\//.test(ua)) {
    browser = 'chrome'
  } else if (/Firefox\//.test(ua)) {
    browser = 'firefox'
  } else if (/Safari\//.test(ua)) {
    browser = 'safari'
  }

  return `${os}+${browser}`
}

export function useSound(audioSrcList?: string[], audioFileLength?: number) {
  let audioList = ref<HTMLAudioElement[]>([])
  let audioLength = ref(1)
  let index = ref(0)

  onMounted(() => {
    if (audioSrcList) setAudio(audioSrcList, audioFileLength)
  })

  //这里同一个音频弄好几份是为了快速打字是，可同时发音
  function setAudio(audioSrcList2: string[], audioFileLength2?: number) {
    //@ts-ignore
    if (import.meta.server) return
    if (audioFileLength2) audioLength.value = audioFileLength2
    audioList.value = []
    for (let i = 0; i < audioLength.value; i++) {
      audioSrcList2.map(src => audioList.value.push(new Audio(ENV.RESOURCE_URL + src)))
    }
    index.value = 0
  }

  function play(volume: number = 100) {
    index.value++
    if (audioList.value.length > 1 && audioList.value.length !== audioLength.value) {
      let htmlAudioElement = audioList.value[index.value % audioList.value.length]
      if (htmlAudioElement) {
        htmlAudioElement.volume = volume / 100
        htmlAudioElement.play()
      }
    } else {
      let htmlAudioElement1 = audioList.value[index.value % audioLength.value]
      if (htmlAudioElement1) {
        htmlAudioElement1.volume = volume / 100
        htmlAudioElement1.play()
      }
    }
  }

  return { play, setAudio }
}

export function usePlayKeyboardAudio() {
  const settingStore = useSettingStore()
  const { play, setAudio } = useSound()

  watchEffect(() => {
    if (!SoundFileOptions.find(v => v.label === settingStore.keyboardSoundFile)) {
      settingStore.keyboardSoundFile = '机械键盘2'
    }
    let urlList = getAudioFileUrl(settingStore.keyboardSoundFile)
    setAudio(urlList, urlList.length === 1 ? 4 : 1)
  })

  function playAudio() {
    if (settingStore.keyboardSound) {
      play(settingStore.keyboardSoundVolume)
    }
  }

  return playAudio
}

export function usePlayBeep() {
  const settingStore = useSettingStore()
  const { play } = useSound([`/sound/beep.wav`], 1)

  function playAudio() {
    if (settingStore.effectSound) {
      play(settingStore.effectSoundVolume)
    }
  }

  return playAudio
}

export function usePlayCorrect() {
  const settingStore = useSettingStore()
  const { play } = useSound([`/sound/correct.wav`], 1)

  function playAudio() {
    if (settingStore.effectSound) {
      play(settingStore.effectSoundVolume)
    }
  }

  return playAudio
}

export function usePlayWordAudio() {
  const settingStore = useSettingStore()
  let audio = ref<HTMLAudioElement>(null)

  onMounted(() => {
    audio.value = new Audio()
  })

  function playAudio(word: string) {
    if (!word) return
    let url = `${PronunciationApi}${word}&type=2`
    if (settingStore.soundType === 'uk') {
      url = `${PronunciationApi}${word}&type=1`
    }
    audio.value.src = url
    audio.value.volume = settingStore.wordSoundVolume / 100
    audio.value.playbackRate = settingStore.wordSoundSpeed
    audio.value.play()
    audio.value.onerror = e => {
      const ttsPlay = useTTsPlayAudio()
      ttsPlay(word)
    }
  }

  return playAudio
}

function getVoicesAsync() {
  return new Promise(resolve => {
    const voices = speechSynthesis.getVoices()
    if (voices.length) return resolve(voices)

    speechSynthesis.onvoiceschanged = () => {
      resolve(speechSynthesis.getVoices())
    }
  })
}
export function useTTsPlayAudio() {
  const settingStore = useSettingStore()

  function playLocal(text: string) {
    speechSynthesis.cancel() // 防止 Chrome 队列卡死
    let msg = new SpeechSynthesisUtterance(text)
    msg.rate = settingStore.wordSoundSpeed
    msg.volume = settingStore.wordSoundVolume / 100
    msg.pitch = 1
    msg.lang = 'en-US'
    getVoicesAsync().then((voices: any[]) => {
      // 优先使用用户在当前浏览器配置的声色
      const browserKey = getBrowserKey()
      const savedVoiceName = settingStore?.ttsVoiceMap?.find(v => v.key === browserKey)?.voice
      if (savedVoiceName) {
        const savedVoice = voices.find(v => v.name === savedVoiceName)
        if (savedVoice) {
          msg.voice = savedVoice
          speechSynthesis.speak(msg)
          return
        }
      }
      // 回退：优先找 Emma / US，否则取第一个英文声色
      let voiceList = voices.filter(v => v.lang === 'en-US')
      if (voiceList && voiceList.length) {
        msg.voice = voiceList.find(v => v.name.includes('US') || v.name.includes('Emma')) ?? voiceList[0]
      }
      speechSynthesis.speak(msg)
    })
  }

  function play(text: string) {
    if (settingStore.useNetworkTts) {
      // 忽略 localStorage 中的旧缓存，直接使用固定新域名
      const baseUrl = 'https://qiaoqiao-tts.dacbbox.com/'
      const url = `${baseUrl}?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(settingStore.networkTtsVoice)}`
      const audio = new Audio(url)
      audio.volume = settingStore.wordSoundVolume / 100
      audio.playbackRate = settingStore.wordSoundSpeed

      let isPlaying = false
      audio.play().then(() => {
        isPlaying = true
      }).catch(e => {
        console.warn('Network TTS failed, fallback to local', e)
        playLocal(text)
      })

      audio.onerror = () => {
        if (!isPlaying) {
          console.warn('Network TTS audio error, fallback to local')
          playLocal(text)
        }
      }
    } else {
      playLocal(text)
    }
  }

  return play
}

export function usePlayAudio(url: string) {
  new Audio(url).play().then(r => void 0)
}

export function getAudioFileUrl(name: string) {
  if (name === '机械键盘') {
    return [
      `/sound/key-sounds/jixie/机械0.mp3`,
      `/sound/key-sounds/jixie/机械1.mp3`,
      `/sound/key-sounds/jixie/机械2.mp3`,
      `/sound/key-sounds/jixie/机械3.mp3`,
    ]
  } else {
    return [`/sound/key-sounds/${name}.mp3`]
  }
}
