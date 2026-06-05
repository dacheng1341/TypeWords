<script setup lang="ts">
import { APP_NAME, GITHUB } from '../config/env.ts'
</script>

<template>
  <h1>{{ APP_NAME }}</h1>
  <div class="w-120">
    <p>
      官网：<a href="https://dacbbox.com" target="_blank">大程开源百宝箱</a>
    </p>
    <div class="mt-20">
      常见问题： <RouterLink to="/help">常见问题解答</RouterLink>
    </div>
  </div>
</template>

<style scoped lang="scss"></style>
