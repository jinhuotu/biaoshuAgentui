<script setup lang="ts">
import { Plus, Trash2 } from 'lucide-vue-next'
import type { NamedRow } from '@/lib/bid-gen-api'

export type RowColumn = { key: string; label: string; width?: string; placeholder?: string }

const props = defineProps<{ columns: RowColumn[]; addLabel?: string }>()
const rows = defineModel<NamedRow[]>({ required: true })

function addRow() {
  rows.value = [...rows.value, Object.fromEntries(props.columns.map((column) => [column.key, '']))]
}

function removeRow(index: number) {
  rows.value = rows.value.filter((_, rowIndex) => rowIndex !== index)
}
</script>

<template>
  <div>
    <div class="overflow-x-auto rounded-md border border-border">
      <table class="w-full text-[12px]">
        <thead class="bg-muted/60 text-muted-foreground">
          <tr>
            <th
              v-for="column in columns"
              :key="column.key"
              class="px-2 py-1.5 text-left font-medium"
              :style="{ width: column.width }"
            >
              {{ column.label }}
            </th>
            <th class="w-9" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="index" class="border-t border-border">
            <td v-for="column in columns" :key="column.key" class="px-1 py-1">
              <input
                v-model="row[column.key]"
                class="w-full rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-border focus:border-primary focus:outline-none"
                :placeholder="column.placeholder || column.label"
              >
            </td>
            <td class="text-center">
              <button
                type="button"
                class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="删除本行"
                @click="removeRow(index)"
              >
                <Trash2 class="size-3.5" />
              </button>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td :colspan="columns.length + 1" class="px-3 py-3 text-center text-muted-foreground">
              投标资料库未匹配到此项，请手动添加
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <button
      type="button"
      class="mt-2 inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1 text-[12px] text-muted-foreground hover:border-primary hover:text-primary"
      @click="addRow"
    >
      <Plus class="size-3.5" />{{ addLabel || '添加一行' }}
    </button>
  </div>
</template>
