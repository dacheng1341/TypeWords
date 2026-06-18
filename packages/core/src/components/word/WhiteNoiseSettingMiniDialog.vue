<script setup lang="ts">
import { BaseIcon, MiniDialog, Option, Select, Switch, Slider } from '@typewords/base'
import { useWindowClick } from '../../hooks/event.ts'
import { useSettingStore } from '../../stores/setting.ts'
import { emitter, EventKey } from '../../utils/eventBus'

import { ENV } from '../../config/env.ts'
import { watch, ref, onMounted } from 'vue'

const settingStore = useSettingStore()
let timer = 0
//停止切换事件，因为hover到select时会跳出mini-dialog
let selectIsOpen = false
let show = $ref(false)
const audioRef = ref<HTMLAudioElement>()

const whiteNoiseOptions = [
  { value: 'heavy-rain', label: '大雨' },
  { value: 'stream', label: '溪流' },
  { value: 'wind', label: '风声' },
  { value: 'forest-rain', label: '森林雨声' },
  { value: 'fireplace', label: '篝火燃烧' },
  { value: 'thunderstorm', label: '雷阵雨' }
]

useWindowClick(() => {
  if (selectIsOpen) {
    selectIsOpen = false
  } else {
    show = false
  }
})

function toggle(val: boolean) {
  if (selectIsOpen) return
  clearTimeout(timer)
  if (val) {
    emitter.emit(EventKey.closeOther)
    show = val
  } else {
    timer = setTimeout(() => {
      show = val
    }, 100)
  }
}

function selectToggle(e: boolean) {
  //这里要延时设置，因为关闭的时候，如果太早设置了false了，useWindowClick的事件就会把弹框关闭
  setTimeout(() => (selectIsOpen = e))
}

function eventCheck(e) {
  const isSelfOrChild = e.currentTarget.contains(e.target)
  if (isSelfOrChild) {
    //如果下拉框打开的情况就不拦截
    if (selectIsOpen) return
    e.stopPropagation()
  }
}

watch(
  () => [settingStore.whiteNoise, settingStore.whiteNoiseType, settingStore.whiteNoiseVolume],
  () => {
    if (!audioRef.value) return
    
    // 音量调节
    audioRef.value.volume = settingStore.whiteNoiseVolume / 100
    
    if (settingStore.whiteNoise) {
      // 如果开启且暂停状态，或者换了音频，就重新加载播放
      const currentSrc = audioRef.value.getAttribute('src')
      const targetSrc = ENV.RESOURCE_URL + `/sound/white-noise/${settingStore.whiteNoiseType}.ogg?v=2`
      
      if (currentSrc !== targetSrc) {
        audioRef.value.src = targetSrc
      }
      audioRef.value.play().catch(e => console.error('Play white noise failed:', e))
    } else {
      audioRef.value.pause()
    }
  },
  { deep: true }
)

onMounted(() => {
  if (settingStore.whiteNoise && audioRef.value) {
    audioRef.value.volume = settingStore.whiteNoiseVolume / 100
    audioRef.value.src = ENV.RESOURCE_URL + `/sound/white-noise/${settingStore.whiteNoiseType}.ogg?v=2`
    // 自动播放可能会被浏览器策略拦截，需要用户发生交互，这里尽力而为
    audioRef.value.play().catch(e => console.error('Auto play white noise failed:', e))
  }
})
</script>

<template>
  <div class="setting" @click="eventCheck">
    <audio ref="audioRef" loop style="display: none;"></audio>
    <BaseIcon @mouseenter="toggle(true)" @mouseleave="toggle(false)" title="心流白噪音">
      <IconPhHeadphones />
    </BaseIcon>
    <MiniDialog width="18rem" @mouseenter="toggle(true)" @mouseleave="toggle(false)" v-model="show">
      <div class="mini-row-title">心流白噪音</div>
      <div class="mini-row">
        <label class="item-title">启用白噪音</label>
        <div class="wrapper">
          <Switch v-model="settingStore.whiteNoise" inline-prompt active-text="开" inactive-text="关" />
        </div>
      </div>
      <div class="mini-row">
        <label class="item-title">场景选择</label>
        <div class="wrapper">
          <Select v-model="settingStore.whiteNoiseType" @toggle="selectToggle" placeholder="请选择" size="small">
            <Option v-for="item in whiteNoiseOptions" :key="item.value" :label="item.label" :value="item.value" />
          </Select>
        </div>
      </div>
      <div class="mini-row">
        <label class="item-title">独立音量</label>
        <div class="wrapper">
          <Slider v-model="settingStore.whiteNoiseVolume" :min="0" :max="100" />
        </div>
      </div>
    </MiniDialog>
  </div>
</template>

<style scoped lang="scss">
.wrapper {
  width: 50%;
  position: relative;
  text-align: right;
}

.volume-slider {
  display: flex;
  align-items: center;
  padding-left: 10px;
}

.setting {
  position: relative;
}

.el-option-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
