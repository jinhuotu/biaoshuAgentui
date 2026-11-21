<script setup lang="ts">
import type { TenderCompany } from '@/lib/tender-companies-api'

defineProps<{
  companyId?: string
  companyName: string
  companies: TenderCompany[]
  disabled?: boolean
  error?: string
}>()
const emit = defineEmits<{ select: [id: string] }>()
</script>

<template>
  <label class="block text-[12px]">
    <span class="text-muted-foreground">本标投标公司</span>
    <select :value="companyId || ''" :disabled="disabled"
      class="mt-1 block w-full rounded-md border border-border bg-background px-2.5 py-2"
      @change="emit('select', ($event.target as HTMLSelectElement).value)">
      <option value="">手动填写（历史资料库）</option>
      <option v-if="companyId && !companies.some(company => company.id === companyId)"
        :value="companyId" disabled>{{ companyName }}（公司资料库不可用）</option>
      <option v-for="company in companies" :key="company.id" :value="company.id">
        {{ company.name }} · {{ company.creditCode }}
      </option>
    </select>
    <span v-if="error" class="mt-1 block text-sulfur">{{ error }}</span>
  </label>
</template>
