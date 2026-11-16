<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { BookOpen, Trash2, UploadCloud } from 'lucide-vue-next'
import { deleteCorpusSource, fetchCorpus, importCorpusFile, type CorpusSummary } from '@/lib/bid-gen-api'

const corpus = ref<CorpusSummary>({ sources: [], sectionCount: 0 })
const busy = ref(false)
const message = ref('')
const errorMessage = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

async function load() {
  try {
    corpus.value = await fetchCorpus()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
}

async function onSelected(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? [])
  ;(event.target as HTMLInputElement).value = ''
  if (!files.length) return
  busy.value = true
  errorMessage.value = ''
  message.value = ''
  let imported = 0
  for (const file of files) {
    try {
      corpus.value = await importCorpusFile(file)
      imported += 1
    } catch (error) {
      errorMessage.value = `${file.name}：${error instanceof Error ? error.message : String(error)}`
    }
  }
  busy.value = false
  if (imported) message.value = `已导入 ${imported} 份标书`
}

async function remove(id: string) {
  corpus.value = await deleteCorpusSource(id)
}

onMounted(load)
</script>

<template>
  <div class="space-y-2 text-[12px]">
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 hover:border-primary hover:text-primary disabled:opacity-50"
        :disabled="busy"
        @click="fileInput?.click()"
      >
        <UploadCloud class="size-3.5" />{{ busy ? '导入中…' : '导入往期标书（Word / PDF）' }}
      </button>
      <span class="text-muted-foreground">共 {{ corpus.sources.length }} 份，{{ corpus.sectionCount }} 个章节</span>
      <input ref="fileInput" type="file" accept=".docx,.pdf" multiple class="hidden" @change="onSelected">
    </div>
    <p v-if="message" class="text-emerald-600">{{ message }}</p>
    <p v-if="errorMessage" class="text-red-600">{{ errorMessage }}</p>
    <ul class="max-h-48 space-y-1 overflow-y-auto">
      <li v-for="source in corpus.sources" :key="source.id" class="flex items-center gap-2 rounded border border-border px-2 py-1">
        <BookOpen class="size-3.5 shrink-0 text-muted-foreground" />
        <span class="min-w-0 flex-1 truncate">{{ source.name }}</span>
        <span class="shrink-0 text-muted-foreground">{{ source.sectionCount }} 章节</span>
        <button type="button" class="rounded p-0.5 text-muted-foreground hover:text-destructive" title="移出标书库" @click="remove(source.id)">
          <Trash2 class="size-3.5" />
        </button>
      </li>
      <li v-if="!corpus.sources.length" class="text-muted-foreground">还没有导入往期标书。导入后，同类评分点会补充“结合我方同类项目经验”的内容。</li>
    </ul>
  </div>
</template>
