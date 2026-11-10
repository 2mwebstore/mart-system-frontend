<script setup lang="ts">
import ToastContainer from '@/components/ToastContainer.vue'
import InUseAlert from '@/components/InUseAlert.vue'
</script>

<template>
  <RouterView />
  <ToastContainer />
  <InUseAlert />
</template>
