<script setup lang="ts">
import { useRouter } from 'vue-router'
import { IS_DEV } from '../config/env'

const router = useRouter()

function goHome() {
  if (IS_DEV) {
    router.push('/')
  } else {
    location.href = window.atob('aHR0cHM6Ly90eXBlLmRhY2Jib3guY29t')
  }
}
</script>

<template>
  <div class="logo-wrap" @click="goHome">
    <span class="logo-text">敲敲背单词</span>
  </div>
</template>

<style scoped lang="scss">
.logo-wrap {
  cursor: pointer;
  margin-bottom: 0.5rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.5rem;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.75;
  }
}

.logo-text {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--color-main-text);
  white-space: nowrap;
}
</style>
