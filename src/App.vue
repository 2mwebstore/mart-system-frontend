<script setup lang="ts">
import ToastContainer from '@/components/ToastContainer.vue'
import InUseAlert from '@/components/InUseAlert.vue'
import { useLiveSettings } from '@/composables/useLiveSettings'

// A change to the company's settings made elsewhere shows in an open app.
useLiveSettings()
</script>

<template>
  <RouterView />
  <ToastContainer />
  <InUseAlert />
</template>
