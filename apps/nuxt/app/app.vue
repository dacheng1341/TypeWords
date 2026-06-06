<script setup lang="ts">
import { onMounted } from 'vue'
import { useUserStore } from '@typewords/core/stores/user.ts'
import LoginModal from '@typewords/core/components/LoginModal.vue'

const userStore = useUserStore()

onMounted(() => {
  // ── 静默恢复 dacbbox 登录态（解决刷新后掉线）──
  // 仅还原 Pinia 状态和 AppEnv 运行时环境，不弹 Toast，不触发数据防覆盖检查
  userStore.restoreLoginState()
})
</script>
<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <LoginModal />
</template>
