<script setup lang="ts">
import type { OutlineNode } from '@/lib/bid-gen-api'

defineProps<{ nodes: OutlineNode[] }>()
</script>

<template>
  <ul class="space-y-0.5">
    <li v-for="node in nodes" :key="node.key">
      <div
        class="flex items-center gap-2 rounded px-1.5 py-1 text-[12px] hover:bg-accent/50"
        :class="node.level === 1 ? 'mt-1 font-semibold' : node.level === 2 ? 'font-medium' : ''"
      >
        <span class="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">H{{ node.level }}</span>
        <span class="min-w-0 flex-1 truncate" :class="node.notApplicable ? 'text-muted-foreground' : ''" :title="node.heading">
          {{ node.heading }}
        </span>
        <span v-if="node.criteria.length" class="shrink-0 rounded border border-primary/30 bg-primary/5 px-1 text-[10px] text-primary">
          响应 {{ node.criteria.length }} 个评分项
        </span>
        <span v-if="node.pendingCount" class="shrink-0 rounded border border-amber-300 bg-amber-50 px-1 text-[10px] text-amber-700">
          待填 {{ node.pendingCount }}
        </span>
        <span v-if="node.placeholderCount" class="shrink-0 rounded border border-border px-1 text-[10px] text-muted-foreground">
          粘贴位 {{ node.placeholderCount }}
        </span>
        <span v-if="node.charCount !== null" class="w-14 shrink-0 text-right text-[10px] text-muted-foreground">
          {{ node.charCount }} 字
        </span>
      </div>
      <BidGenOutlineTree v-if="node.children.length" :nodes="node.children" class="ml-4 border-l border-border pl-1.5" />
    </li>
  </ul>
</template>
