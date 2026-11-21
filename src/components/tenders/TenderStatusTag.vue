<script setup lang="ts">
import { computed } from 'vue'
import { Tag } from '@/components/ui-kit'
import { TASK_STATUS_LABEL, TASK_STATUS_TONE, type TaskStatus } from '@/lib/tender-tasks'

const props = defineProps<{
  status: TaskStatus | string
}>()

const label = computed(() => TASK_STATUS_LABEL[props.status as TaskStatus] || props.status)
const tone = computed(() => TASK_STATUS_TONE[props.status as TaskStatus] || 'default')
</script>

<template>
  <Tag :tone="tone" class-name="h-6 min-w-[4.5rem] shrink-0 justify-center whitespace-nowrap px-2 py-0 text-[11px] leading-none">{{ label }}</Tag>
</template>
