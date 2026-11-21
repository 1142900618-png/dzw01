<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { X } from 'lucide-vue-next'
defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
onMounted(() => dialog.value?.showModal())
</script>
<template>
  <dialog
    ref="dialog"
    class="wh-dialog"
    :aria-label="title"
    @close="emit('close')"
    @click="$event.target === dialog && dialog?.close()"
  >
    <div class="wh-dialog-inner">
      <div class="wh-panel-head">
        <h2>{{ title }}</h2>
        <button class="wh-icon-btn" aria-label="关闭详情" @click="dialog?.close()">
          <X :size="19" />
        </button>
      </div>
      <slot />
    </div>
  </dialog>
</template>
