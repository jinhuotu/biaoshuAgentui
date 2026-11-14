<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle, FileArchive, FileText, FileSignature, File as FileIcon } from 'lucide-vue-next'
import type { BidTask, TenderCriterion, TreeEntry } from '@/lib/bid-gen-api'

const props = defineProps<{ task: BidTask }>()
const lotCodes = defineModel<string[]>('lotCodes', { required: true })
const packageNo = defineModel<string>('packageNo', { required: true })
const signDate = defineModel<string>('signDate', { required: true })

const TABS = [
  { key: 'lots', label: '所投分标' },
  { key: 'files', label: '压缩包结构' },
  { key: 'criteria', label: '评分标准' },
  { key: 'format', label: '投标文件格式目录' },
  { key: 'specs', label: '技术规范书' },
] as const

const activeTab = ref<(typeof TABS)[number]['key']>('lots')
const tender = computed(() => props.task.tender)

type FlatEntry = TreeEntry & { roleLabel: string; note: string }

const flatFiles = computed<FlatEntry[]>(() => {
  const roles = new Map(tender.value.files.map((file) => [file.logicalPath, file]))
  const result: FlatEntry[] = []
  const visit = (entries: TreeEntry[]) => {
    for (const entry of entries) {
      const file = roles.get(entry.logical_path)
      result.push({ ...entry, roleLabel: file?.roleLabel ?? '', note: file?.note ?? '' })
      visit(entry.children)
    }
  }
  visit(props.task.tree)
  return result
})
const maxDepth = computed(() => Math.max(0, ...flatFiles.value.map((file) => file.depth)) + 1)
const lotGroups = computed(() => {
  const groups = new Map<string, typeof tender.value.lots>()
  for (const lot of tender.value.lots) groups.set(lot.category, [...(groups.get(lot.category) ?? []), lot])
  return [...groups.entries()]
})
const selectedCategories = computed(
  () => new Set(tender.value.lots.filter((lot) => lotCodes.value.includes(lot.lotCode)).map((lot) => lot.category)),
)
const criteriaGroups = computed(() => {
  const groups: { title: string; applicable: boolean; items: TenderCriterion[]; maxScore: number }[] = []
  for (const criterion of tender.value.criteria) {
    const title = criterion.volume === 'price' ? '报价评分标准' : criterion.volume === 'business' ? '商务 / 其他评分标准' : `技术评分标准${criterion.category ? ` · ${criterion.category}` : ''}`
    let group = groups.find((entry) => entry.title === title)
    if (!group) {
      const applicable =
        criterion.volume !== 'technical' || !criterion.category ||
        [...selectedCategories.value].some((category) => category === criterion.category)
      group = { title, applicable, items: [], maxScore: 0 }
      groups.push(group)
    }
    group.items.push(criterion)
    group.maxScore += Math.max(0, criterion.maxScore ?? 0)
  }
  return groups
})

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function toggleCategory(category: string, checked: boolean) {
  const codes = tender.value.lots.filter((lot) => lot.category === category).map((lot) => lot.lotCode)
  const rest = lotCodes.value.filter((code) => !codes.includes(code))
  lotCodes.value = checked ? [...rest, ...codes] : rest
}

function categoryChecked(category: string) {
  return tender.value.lots.filter((lot) => lot.category === category).every((lot) => lotCodes.value.includes(lot.lotCode))
}
</script>

<template>
  <div class="space-y-3">
    <div class="grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-lg border border-border bg-card p-3 text-[12px] md:grid-cols-2 xl:grid-cols-3">
      <p class="md:col-span-2 xl:col-span-3"><span class="text-muted-foreground">项目名称：</span><b>{{ tender.projectName || '未识别' }}</b></p>
      <p><span class="text-muted-foreground">招标编号：</span>{{ tender.tenderNo || '未识别' }}</p>
      <p><span class="text-muted-foreground">投标截止时间：</span>{{ tender.bidDeadline.replace('T', ' ') || '未识别' }}</p>
      <p><span class="text-muted-foreground">投标有效期：</span>{{ tender.validityDays }} 日（至 {{ tender.validityEnd || '—' }}）</p>
      <p><span class="text-muted-foreground">投标保证金：</span>{{ tender.bidBondRequired ? '需要提交' : '不收取（相关章节自动标注不适用）' }}</p>
      <p><span class="text-muted-foreground">联合体投标：</span>{{ tender.consortiumAllowed ? '接受' : '不接受' }}</p>
      <p><span class="text-muted-foreground">招标代理：</span>{{ tender.agency || '—' }}</p>
      <p class="md:col-span-2 xl:col-span-3"><span class="text-muted-foreground">招标人：</span>{{ tender.purchasers.join('、') || '—' }}</p>
      <p class="text-muted-foreground md:col-span-2 xl:col-span-3">
        已识别：{{ flatFiles.length }} 个文件（压缩包嵌套 {{ maxDepth }} 层）· {{ tender.lots.length }} 个分标 ·
        {{ tender.criteria.length }} 条评分细则 · {{ tender.formatItems.length }} 个格式目录条目 ·
        {{ tender.techSpecs.length }} 份技术规范书 · {{ tender.qualificationCount }} 条资格要求 · {{ tender.clauseCount }} 条须知前附表条款
      </p>
    </div>
    <p
      v-for="warning in tender.warnings"
      :key="warning"
      class="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] text-amber-800"
    >
      <AlertTriangle class="mt-0.5 size-3.5 shrink-0" />{{ warning }}
    </p>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        class="rounded-md border px-3 py-1.5 text-[12px]"
        :class="activeTab === tab.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/60'"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 所投分标 -->
    <div v-show="activeTab === 'lots'" class="space-y-3">
      <div class="flex flex-wrap items-end gap-4 text-[12px]">
        <label class="block">
          <span class="mb-1 block text-muted-foreground">包号</span>
          <input v-model="packageNo" class="w-32 rounded-md border border-border bg-background px-2.5 py-1.5 focus:border-primary focus:outline-none" placeholder="如 包1">
        </label>
        <label class="block">
          <span class="mb-1 block text-muted-foreground">投标文件落款日期（留空则自动取投标截止日或今天）</span>
          <input v-model="signDate" type="date" class="rounded-md border border-border bg-background px-2.5 py-1.5 focus:border-primary focus:outline-none">
        </label>
        <span class="pb-1.5 text-muted-foreground">已选 {{ lotCodes.length }} 个分标</span>
      </div>
      <div v-for="[category, lots] in lotGroups" :key="category" class="overflow-hidden rounded-lg border border-border bg-card">
        <label class="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-1.5 text-[12px] font-medium">
          <input type="checkbox" class="size-3.5 accent-[var(--primary)]" :checked="categoryChecked(category)" @change="toggleCategory(category, ($event.target as HTMLInputElement).checked)">
          {{ category }}
        </label>
        <table class="w-full text-[12px]">
          <thead class="text-muted-foreground">
            <tr>
              <th class="w-9" />
              <th class="px-2 py-1.5 text-left font-medium">分标名称</th>
              <th class="px-2 py-1.5 text-left font-medium">分标编号</th>
              <th class="px-2 py-1.5 text-left font-medium">采购数量</th>
              <th class="px-2 py-1.5 text-left font-medium">合同包</th>
              <th class="px-2 py-1.5 text-left font-medium">权重（技术 / 商务 / 价格）</th>
              <th class="px-2 py-1.5 text-left font-medium">业绩门槛</th>
              <th class="px-2 py-1.5 text-left font-medium">授标规则</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="lot in lots" :key="lot.lotCode" class="border-t border-border">
              <td class="text-center"><input v-model="lotCodes" type="checkbox" :value="lot.lotCode" class="size-3.5 accent-[var(--primary)]"></td>
              <td class="px-2 py-1.5">{{ lot.lotName }}</td>
              <td class="px-2 py-1.5 font-mono text-[11px]">{{ lot.lotCode }}</td>
              <td class="px-2 py-1.5">{{ lot.quantity }} {{ lot.unit }}</td>
              <td class="px-2 py-1.5">{{ lot.packageRange }}</td>
              <td class="px-2 py-1.5">{{ lot.weights.filter(Boolean).join(' / ') || '—' }}</td>
              <td class="px-2 py-1.5">{{ lot.performanceRequirement || '—' }}</td>
              <td class="px-2 py-1.5">{{ lot.awardRule || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!tender.lots.length" class="text-[12px] text-muted-foreground">招标文件中未识别到分标表，将按单一标的生成。</p>
    </div>

    <!-- 压缩包结构 -->
    <div v-show="activeTab === 'files'" class="rounded-lg border border-border bg-card p-2">
      <div
        v-for="file in flatFiles"
        :key="file.logical_path"
        class="flex items-center gap-2 rounded px-1.5 py-1 text-[12px] hover:bg-accent/50"
        :style="{ paddingLeft: `${6 + file.depth * 20}px` }"
      >
        <FileArchive v-if="file.suffix === '.zip'" class="size-3.5 shrink-0 text-amber-600" />
        <FileText v-else-if="file.suffix === '.docx'" class="size-3.5 shrink-0 text-primary" />
        <FileSignature v-else-if="file.suffix === '.sign'" class="size-3.5 shrink-0 text-muted-foreground" />
        <FileIcon v-else class="size-3.5 shrink-0 text-muted-foreground" />
        <span class="min-w-0 flex-1 truncate" :title="file.logical_path">{{ file.name }}</span>
        <span v-if="file.note" class="shrink-0 text-[11px] text-amber-700">{{ file.note }}</span>
        <span class="shrink-0 rounded border border-border px-1.5 text-[10px] text-muted-foreground">{{ file.roleLabel }}</span>
        <span class="w-16 shrink-0 text-right text-[11px] text-muted-foreground">{{ formatSize(file.size) }}</span>
      </div>
    </div>

    <!-- 评分标准 -->
    <div v-show="activeTab === 'criteria'" class="space-y-3">
      <details v-for="group in criteriaGroups" :key="group.title" class="overflow-hidden rounded-lg border border-border bg-card" :open="group.applicable">
        <summary class="cursor-pointer bg-muted/50 px-3 py-1.5 text-[12px] font-medium">
          {{ group.title }} · {{ group.items.length }} 项 · 正向分值合计 {{ group.maxScore }}
          <span v-if="!group.applicable" class="ml-2 font-normal text-muted-foreground">（本次未投该品类，不参与自查）</span>
        </summary>
        <table class="w-full text-[12px]">
          <thead class="text-muted-foreground">
            <tr>
              <th class="w-[150px] px-2 py-1.5 text-left font-medium">项目</th>
              <th class="w-[170px] px-2 py-1.5 text-left font-medium">评审要素</th>
              <th class="w-[90px] px-2 py-1.5 text-left font-medium">分值范围</th>
              <th class="px-2 py-1.5 text-left font-medium">评审细则</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="criterion in group.items" :key="criterion.criterionId" class="border-t border-border align-top">
              <td class="px-2 py-1.5 text-muted-foreground">{{ criterion.group }}</td>
              <td class="px-2 py-1.5 font-medium">{{ criterion.factor }}</td>
              <td class="px-2 py-1.5">{{ criterion.maxScore === null ? '—' : `${criterion.minScore} ~ ${criterion.maxScore}` }}</td>
              <td class="whitespace-pre-line px-2 py-1.5 leading-relaxed">{{ criterion.rule }}</td>
            </tr>
          </tbody>
        </table>
      </details>
      <p v-if="!tender.criteria.length" class="text-[12px] text-muted-foreground">未识别到评分标准表。</p>
    </div>

    <!-- 格式目录 -->
    <div v-show="activeTab === 'format'" class="overflow-hidden rounded-lg border border-border bg-card">
      <table class="w-full text-[12px]">
        <thead class="bg-muted/60 text-muted-foreground">
          <tr>
            <th class="w-[90px] px-2 py-1.5 text-left font-medium">卷册</th>
            <th class="w-[70px] px-2 py-1.5 text-left font-medium">序号</th>
            <th class="px-2 py-1.5 text-left font-medium">条目</th>
            <th class="w-[110px] px-2 py-1.5 text-left font-medium">处理方式</th>
            <th class="w-[260px] px-2 py-1.5 text-left font-medium">投标工具上传端口</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in tender.formatItems" :key="item.volume + item.number" class="border-t border-border">
            <td class="px-2 py-1.5 text-muted-foreground">{{ item.volume }}</td>
            <td class="px-2 py-1.5">{{ item.number }}</td>
            <td class="px-2 py-1.5" :style="{ paddingLeft: `${8 + (item.level - 1) * 16}px` }">{{ item.title }}</td>
            <td class="px-2 py-1.5">
              <span v-if="item.volume === '价格文件'" class="text-muted-foreground">投标工具在线填报</span>
              <span v-else-if="item.notApplicable" class="text-muted-foreground">标注不适用</span>
              <span v-else class="text-emerald-700">生成正文</span>
            </td>
            <td class="px-2 py-1.5 text-muted-foreground">{{ item.port }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!tender.formatItems.length" class="p-3 text-[12px] text-muted-foreground">未识别到格式目录，将按通用货物类投标文件结构编排。</p>
    </div>

    <!-- 技术规范书 -->
    <div v-show="activeTab === 'specs'" class="overflow-hidden rounded-lg border border-border bg-card">
      <table class="w-full text-[12px]">
        <thead class="bg-muted/60 text-muted-foreground">
          <tr>
            <th class="px-2 py-1.5 text-left font-medium">固化 ID</th>
            <th class="px-2 py-1.5 text-left font-medium">产品型号</th>
            <th class="px-2 py-1.5 text-left font-medium">导体</th>
            <th class="px-2 py-1.5 text-left font-medium">芯数×截面</th>
            <th class="px-2 py-1.5 text-left font-medium">电压等级</th>
            <th class="px-2 py-1.5 text-left font-medium">参数条数</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="spec in tender.techSpecs" :key="spec.fixedId" class="border-t border-border">
            <td class="px-2 py-1.5 font-mono text-[11px]">{{ spec.fixedId }}</td>
            <td class="px-2 py-1.5">{{ spec.model || '—' }}</td>
            <td class="px-2 py-1.5">{{ spec.conductor || '—' }}</td>
            <td class="px-2 py-1.5">{{ spec.coreSection || '—' }}</td>
            <td class="px-2 py-1.5">{{ spec.voltage || '—' }}</td>
            <td class="px-2 py-1.5">{{ spec.parameterCount }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!tender.techSpecs.length" class="p-3 text-[12px] text-muted-foreground">压缩包中未识别到技术规范书。</p>
    </div>
  </div>
</template>
