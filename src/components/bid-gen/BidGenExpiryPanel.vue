<script setup lang="ts">
import { ref, watch } from 'vue'
import { fetchLibraryExpiry, type LibraryExpiry } from '@/lib/bid-gen-api'

const props = defineProps<{ active: boolean; refreshKey: string }>()
const data = ref<LibraryExpiry | null>(null)
const loading = ref(false)
const error = ref('')
let requestId = 0

async function refresh() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  data.value = null
  try {
    const next = await fetchLibraryExpiry()
    if (id === requestId) data.value = next
  } catch (cause) {
    if (id === requestId) error.value = cause instanceof Error ? cause.message : '资料有效期读取失败'
  } finally {
    if (id === requestId) loading.value = false
  }
}

watch(() => [props.active, props.refreshKey], () => {
  if (props.active) void refresh()
  else {
    requestId += 1
    loading.value = false
    data.value = null
  }
}, { immediate: true })
</script>

<template>
  <section class="rounded-lg border border-border bg-card p-3 text-[12px]">
    <div class="flex items-center justify-between gap-2">
      <p class="font-medium">资料库当前临期提醒</p>
      <button type="button" class="rounded border border-border px-2 py-1 hover:border-primary disabled:opacity-50" :disabled="loading" @click="refresh">
        {{ loading ? '检查中…' : '刷新提醒' }}
      </button>
    </div>
    <p class="mt-1 text-[11px] text-muted-foreground">
      检查投标资料库中已审核的全部资料，包含未匹配为证件的文件；不代表本次标书已采用这些资料。
      <template v-if="data">提前 {{ data.warnDays }} 天提醒，与资料库一致。</template>
      修改资料后需重新生成，才能更新下方生成时快照和 Word 文件。
    </p>
    <p v-if="loading" class="mt-2 text-muted-foreground">正在读取资料库有效期…</p>
    <p v-else-if="error" role="alert" class="mt-2 text-red-600">{{ error }}，请重试。</p>
    <template v-else-if="data">
      <p v-if="!data.items.length" class="mt-2 text-muted-foreground">当前已审核资料中未发现已过期或临近到期的文件。</p>
      <ul v-else class="mt-2 space-y-2">
        <li v-for="item in data.items" :key="item.documentId" class="rounded border border-border px-3 py-2">
          <p class="font-medium">{{ item.name }}</p>
          <p class="mt-1" :class="item.expire_level === 'danger' ? 'text-red-600' : 'text-amber-700'">
            {{ item.expire_status === 'expired' ? '已过期' : '临近到期' }} · 到期日 {{ item.expire_at }} ·
            {{ item.expire_days < 0 ? `已过期 ${-item.expire_days} 天` : `剩余 ${item.expire_days} 天` }}
          </p>
          <p class="mt-1 text-[11px] text-muted-foreground">来源：{{ item.source }}</p>
        </li>
      </ul>
    </template>
  </section>
</template>
