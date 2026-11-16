<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { renderAsync } from 'docx-preview'
import { AlertTriangle, CheckCircle2, CircleDashed, Download, FileText, ShieldCheck } from 'lucide-vue-next'
import BidGenOutlineTree from './BidGenOutlineTree.vue'
import BidGenExpiryPanel from './BidGenExpiryPanel.vue'
import { combinedEstimatedScore, fileScoreLines, hasScoreCriteria, overallScoreLine, scoreValue } from '@/lib/bid-gen-score'
import {
  downloadBidFile,
  downloadBidScoreCheck,
  fetchBidFileBlob,
  type BidTask,
  type CertificateStatus,
  type ScoreCheckItem,
  type ScoreStatus,
} from '@/lib/bid-gen-api'

const props = defineProps<{ task: BidTask }>()

const TABS = [
  { key: 'score', label: '评分标准自查' },
  { key: 'outline', label: '目录层级' },
  { key: 'preview', label: 'Word 预览' },
  { key: 'certificates', label: '证件效期' },
  { key: 'todo', label: '待补充与核对' },
] as const

const SCORE_STYLE: Record<ScoreStatus, string> = {
  full: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  missing: 'bg-red-50 text-red-700 border-red-200',
  manual: 'bg-sky-50 text-sky-700 border-sky-200',
  external: 'bg-slate-50 text-slate-600 border-slate-200',
}
const CERT_STYLE: Record<CertificateStatus, string> = {
  valid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  expiring: 'bg-amber-50 text-amber-700 border-amber-200',
  insufficient: 'bg-orange-50 text-orange-700 border-orange-200',
  expired: 'bg-red-50 text-red-700 border-red-200',
  unknown: 'bg-slate-50 text-slate-600 border-slate-200',
}
const SCORE_FILTERS: { key: ScoreStatus | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'missing', label: '未响应 / 缺资料' },
  { key: 'partial', label: '可提升' },
  { key: 'manual', label: '需人工确认' },
  { key: 'full', label: '满足' },
  { key: 'external', label: '招标人评定' },
]

const activeTab = ref<(typeof TABS)[number]['key']>('score')
const scoreFilter = ref<ScoreStatus | 'all'>('all')
const previewFile = ref('')
const previewHost = ref<HTMLElement | null>(null)
const previewState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const previewError = ref('')
const downloading = ref('')
const scoreExporting = ref(false)
const errorMessage = ref('')
let previewToken = 0

const result = computed(() => props.task.result!)
const hasCriteria = computed(() => hasScoreCriteria(result.value.scoreCheck))
const wordFiles = computed(() => result.value.files.filter((file) => file.name.endsWith('.docx')))
const scoreItems = computed<ScoreCheckItem[]>(() =>
  result.value.scoreCheck.items.filter((item) => scoreFilter.value === 'all' || item.status === scoreFilter.value),
)
const scoreGroups = computed(() => {
  const groups: { title: string; items: ScoreCheckItem[] }[] = []
  for (const item of scoreItems.value) {
    const label = item.volume === 'price' ? '报价评分' : item.volume === 'business' ? '商务 / 其他评分' : `技术评分${item.category ? `（${item.category}）` : ''}`
    const title = `${label} · ${item.group}`
    const group = groups.find((entry) => entry.title === title)
    if (group) group.items.push(item)
    else groups.push({ title, items: [item] })
  }
  return groups
})
const reviewGroups = computed(() => {
  const groups = new Map<string, typeof result.value.reviewItems>()
  for (const item of result.value.reviewItems) {
    const key = `${item.spec}（固化ID ${item.fixedId}）`
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.entries()]
})

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function scoreRange(item: ScoreCheckItem) {
  if (item.maxScore === null || item.minScore === null) return '—'
  return `${item.minScore} ~ ${item.maxScore}`
}

async function download(name: string) {
  downloading.value = name
  errorMessage.value = ''
  try {
    await downloadBidFile(props.task.id, name)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    downloading.value = ''
  }
}

async function exportScoreCheck() {
  scoreExporting.value = true
  errorMessage.value = ''
  try {
    await downloadBidScoreCheck(props.task.id)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    scoreExporting.value = false
  }
}

async function renderPreview() {
  const host = previewHost.value
  if (!host || !previewFile.value) return
  const token = ++previewToken
  previewState.value = 'loading'
  previewError.value = ''
  try {
    const blob = await fetchBidFileBlob(props.task.id, previewFile.value)
    if (token !== previewToken) return
    host.innerHTML = ''
    await renderAsync(blob, host, undefined, {
      className: 'bid-docx',
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: true,
      experimental: true,
      useBase64URL: true,
      renderHeaders: true,
      renderFooters: true,
    })
    if (token === previewToken) previewState.value = 'ready'
  } catch (error) {
    if (token !== previewToken) return
    previewState.value = 'error'
    previewError.value = error instanceof Error ? error.message : String(error)
  }
}

watch(
  () => [activeTab.value, previewFile.value, result.value.generatedAt],
  async ([tab]) => {
    if (tab !== 'preview') return
    if (!previewFile.value) previewFile.value = wordFiles.value.find((file) => file.key === 'business')?.name ?? wordFiles.value[0]?.name ?? ''
    await nextTick()
    await renderPreview()
  },
)
</script>

<template>
  <div class="space-y-4">
    <!-- 概览 -->
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      <div class="rounded-lg border border-border bg-card p-3">
        <p class="text-[11px] text-muted-foreground">预计页数（完整版）</p>
        <p class="mt-1 text-xl font-semibold">约 {{ result.stats.estimatedPages }} <span class="text-[12px] font-normal">页</span></p>
      </div>
      <div class="rounded-lg border border-border bg-card p-3">
        <p class="text-[11px] text-muted-foreground">正文字数</p>
        <p class="mt-1 text-xl font-semibold">{{ result.stats.charCount.toLocaleString() }}</p>
      </div>
      <div class="rounded-lg border border-border bg-card p-3">
        <p class="text-[11px] text-muted-foreground">章节 / 标题层级</p>
        <p class="mt-1 text-xl font-semibold">{{ result.stats.sectionCount }} <span class="text-[12px] font-normal">节 · {{ result.stats.maxDepth }} 级</span></p>
      </div>
      <div class="rounded-lg border border-border bg-card p-3">
        <p class="text-[11px] text-muted-foreground">表格</p>
        <p class="mt-1 text-xl font-semibold">{{ result.stats.tableCount }} <span class="text-[12px] font-normal">张</span></p>
      </div>
      <div class="rounded-lg border border-border bg-card p-3">
        <p class="text-[11px] text-muted-foreground">评分项响应覆盖率</p>
        <p class="mt-1 text-xl font-semibold" :class="hasCriteria && result.scoreCheck.passed ? 'text-emerald-600' : 'text-amber-600'">{{ hasCriteria && result.scoreCheck.coverage != null ? `${result.scoreCheck.coverage}%` : '暂不可评' }}</p>
      </div>
      <div class="rounded-lg border border-border bg-card p-3">
        <p class="text-[11px] text-muted-foreground">综合预估得分</p>
        <p class="mt-1 text-xl font-semibold text-primary">{{ combinedEstimatedScore(result.scoreCheck) ?? '暂不可评' }}<span v-if="combinedEstimatedScore(result.scoreCheck) != null" class="text-[12px] font-normal"> 分</span></p>
        <p class="mt-1 text-[10px] leading-relaxed text-muted-foreground">{{ overallScoreLine(result.scoreCheck) }}</p>
      </div>
      <div class="rounded-lg border border-border bg-card p-3">
        <p class="text-[11px] text-muted-foreground">待补充 / 需核对</p>
        <p class="mt-1 text-xl font-semibold">{{ result.stats.pendingCount }} <span class="text-[12px] font-normal">/ {{ result.stats.reviewCount }}</span></p>
      </div>
    </div>

    <!-- 下载 -->
    <div class="rounded-lg border border-border bg-card p-3">
      <div class="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
        <FileText class="size-4 text-primary" />
        <span class="font-medium">生成文件（标准 Word .docx，可直接用 Microsoft Word 打开编辑）</span>
        <span class="text-muted-foreground">生成于 {{ result.generatedAt.replace('T', ' ') }}</span>
      </div>
      <div class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <button
          v-for="file in result.files"
          :key="file.name"
          type="button"
          class="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-[12px] hover:border-primary hover:bg-primary/5 disabled:opacity-50"
          :disabled="downloading === file.name"
          @click="download(file.name)"
        >
          <Download class="size-4 shrink-0 text-primary" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{{ file.label }}</span>
            <span class="block truncate text-[11px] text-muted-foreground">
              {{ formatSize(file.size) }}{{ file.estimatedPages ? ` · 约 ${file.estimatedPages} 页` : '' }}
            </span>
            <span v-for="line in fileScoreLines(result.scoreCheck, file.key)" :key="line" class="mt-1 block text-[11px] text-muted-foreground">{{ line }}</span>
          </span>
        </button>
      </div>
      <p v-if="errorMessage" role="alert" class="mt-2 text-[12px] text-red-600">{{ errorMessage }}</p>
      <p class="mt-2 text-[11px] text-muted-foreground">
        首次用 Word 打开时如提示“是否更新域”，选择“是”即可刷新目录页码。页数为按字数与表格行数的估算值，以 Word 实际排版为准。
      </p>
    </div>

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

    <!-- 评分自查 -->
    <div v-show="activeTab === 'score'" class="space-y-3">
      <p v-if="!hasCriteria" role="alert" class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
        未识别到适用的评分标准，暂不可评分。这不代表得分为零或自查通过。旧任务可先重新生成以读取最新评分规则；仍未识别时，请补充包含评分细则的 Word 招标文件后重新上传。
      </p>
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div v-for="volume in result.scoreCheck.volumes" :key="volume.volume" class="rounded-lg border border-border bg-card p-3 text-[12px]">
          <div class="flex items-center justify-between">
            <span class="font-medium">{{ volume.label }}（共 {{ volume.total }} 项）</span>
            <span>
              <b class="text-[13px] leading-relaxed text-primary">{{ scoreValue(result.scoreCheck, volume) }}</b>
            </span>
          </div>
          <div class="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
            <span class="bg-emerald-500" :style="{ width: `${(100 * volume.counts.full) / volume.total}%` }" />
            <span class="bg-sky-400" :style="{ width: `${(100 * volume.counts.manual) / volume.total}%` }" />
            <span class="bg-amber-400" :style="{ width: `${(100 * volume.counts.partial) / volume.total}%` }" />
            <span class="bg-red-500" :style="{ width: `${(100 * volume.counts.missing) / volume.total}%` }" />
            <span class="bg-slate-300" :style="{ width: `${(100 * volume.counts.external) / volume.total}%` }" />
          </div>
          <p class="mt-2 text-[11px] text-muted-foreground">
            满足 {{ volume.counts.full }} · 需人工确认 {{ volume.counts.manual }} · 可提升 {{ volume.counts.partial }} ·
            未响应 / 缺资料 {{ volume.counts.missing }} · 招标人评定 {{ volume.counts.external }}（{{ volume.externalMaxScore }} 分）
            <template v-if="volume.unestimated">；另有 {{ volume.unestimated }} 项无法自动估分</template>
          </p>
        </div>
      </div>
      <p v-if="result.scoreCheck.expiredCertificates.length" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
        以下证件在投标截止日已失效，未计入得分支撑：{{ result.scoreCheck.expiredCertificates.join('、') }}
      </p>
      <div class="flex flex-wrap items-center gap-1.5 text-[12px]">
        <button
          v-for="filter in SCORE_FILTERS"
          :key="filter.key"
          type="button"
          class="rounded-full border px-2.5 py-0.5"
          :class="scoreFilter === filter.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'"
          @click="scoreFilter = filter.key"
        >
          {{ filter.label }}
        </button>
        <span class="ml-2 text-[11px] text-muted-foreground">
          {{ result.scoreCheck.readBack ? '已读取生成的 Word 文件；识别评分条款不代表已经响应或得分' : '按章节结构核对' }}
        </span>
        <button
          type="button"
          class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1 text-[12px] text-primary hover:bg-primary/10 disabled:opacity-50"
          :disabled="scoreExporting"
          @click="exportScoreCheck"
        >
          <Download class="size-3.5" />
          {{ scoreExporting ? '正在导出…' : '导出评分自查 Excel' }}
        </button>
      </div>
      <p class="text-[11px] text-muted-foreground">评分明细共五列，判定依据、改进建议与 Excel 对应；可拖动底部滚动条左右查看，上下滚动查看全部评分项。</p>
      <div class="bid-score-scroll rounded-lg border border-border bg-card focus-visible:outline-2 focus-visible:outline-primary" role="region" aria-label="评分明细" tabindex="0">
        <table class="bid-score-table text-[12px]">
          <caption class="sr-only">评分项明细，包含评审细则、响应章节、判定依据和改进建议</caption>
          <colgroup>
            <col style="width: 13%">
            <col style="width: 24%">
            <col style="width: 18%">
            <col style="width: 20%">
            <col style="width: 25%">
          </colgroup>
          <thead class="sticky top-0 z-10 bg-muted">
            <tr>
              <th scope="col" class="font-medium">评分项 / 自查状态</th>
              <th scope="col" class="font-medium">评审细则</th>
              <th scope="col" class="font-medium">响应章节</th>
              <th scope="col" class="font-medium">判定依据</th>
              <th scope="col" class="font-medium">改进建议</th>
            </tr>
          </thead>
          <tbody v-for="group in scoreGroups" :key="group.title">
            <tr class="bg-muted/50">
              <th colspan="5" scope="rowgroup" class="font-medium">{{ group.title }}</th>
            </tr>
            <tr v-for="item in group.items" :key="item.criterionId">
              <td>
                <p class="font-medium">{{ item.factor }}</p>
                <p class="mt-0.5 text-[11px] text-muted-foreground">分值范围 {{ scoreRange(item) }}</p>
                <span class="mt-1 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]" :class="SCORE_STYLE[item.status]">
                  <CheckCircle2 v-if="item.status === 'full'" class="size-3" />
                  <AlertTriangle v-else-if="item.status === 'missing' || item.status === 'partial'" class="size-3" />
                  <CircleDashed v-else class="size-3" />
                  {{ item.statusLabel }}
                </span>
                <p v-if="item.estimatedScore !== null && !item.deduction" class="mt-1 text-[11px]">
                  预估得分 <b class="text-primary">{{ item.estimatedScore }}</b>
                </p>
              </td>
              <td>
                <p class="whitespace-pre-line leading-relaxed">{{ item.rule }}</p>
              </td>
              <td>
                <p v-if="item.sections.length">{{ item.sections.map((section) => section.heading).join('；') }}</p>
                <p v-else class="text-muted-foreground">{{ item.status === 'external' ? '无需投标文件响应' : '未找到响应章节' }}</p>
              </td>
              <td>
                <p class="whitespace-pre-line leading-relaxed" :class="!item.basis ? 'text-muted-foreground' : ''">{{ item.basis || '—' }}</p>
              </td>
              <td>
                <ul v-if="item.advice.length" class="list-disc pl-4 text-amber-700">
                  <li v-for="advice in item.advice" :key="advice" class="whitespace-pre-line leading-relaxed">{{ advice }}</li>
                </ul>
                <p v-else class="text-muted-foreground">—</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 目录层级 -->
    <div v-show="activeTab === 'outline'" class="rounded-lg border border-border bg-card p-3">
      <p class="mb-2 text-[11px] text-muted-foreground">
        目录顺序、条目名称取自招标文件第六章“投标文件格式目录”；H1~H{{ result.stats.maxDepth }} 对应 Word 标题 1~{{ result.stats.maxDepth }}，可在 Word 导航窗格中逐级展开。
      </p>
      <BidGenOutlineTree :nodes="result.outline" />
    </div>

    <!-- Word 预览 -->
    <div v-show="activeTab === 'preview'" class="rounded-lg border border-border bg-card p-3">
      <div class="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
        <span class="text-muted-foreground">预览文件</span>
        <button
          v-for="file in wordFiles"
          :key="file.name"
          type="button"
          class="rounded-md border px-2.5 py-1"
          :class="previewFile === file.name ? 'border-primary bg-primary/10 text-primary' : 'border-border'"
          @click="previewFile = file.name"
        >
          {{ file.label }}
        </button>
        <span v-if="previewState === 'loading'" class="text-muted-foreground">正在渲染…（完整版页数较多，需要几秒）</span>
        <span v-if="previewState === 'error'" class="text-red-600">{{ previewError }}</span>
      </div>
      <div ref="previewHost" class="bid-preview-host" />
    </div>

    <!-- 证件效期 -->
    <div v-show="activeTab === 'certificates'" class="space-y-2">
      <BidGenExpiryPanel :active="activeTab === 'certificates'" :refresh-key="`${task.id}:${result.generatedAt}`" />
      <p class="text-[12px] font-medium">本次生成时的证件效期快照 · {{ result.certificateCheck.checkedAt.replace('T', ' ') }}</p>
      <div
        class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-[12px]"
        :class="result.certificateCheck.passed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'"
      >
        <span class="inline-flex items-center gap-1 font-medium">
          <ShieldCheck v-if="result.certificateCheck.passed" class="size-4" /><AlertTriangle v-else class="size-4" />
          {{ result.certificateCheck.passed ? '生成时证件效期校验通过' : '生成时证件效期校验未通过' }}
        </span>
        <span>投标截止日 {{ result.certificateCheck.bidDeadline.replace('T', ' ') || '未识别' }}</span>
        <span>投标有效期届满日 {{ result.certificateCheck.validityEnd || '未识别' }}</span>
        <span v-if="result.certificateCheck.missing.length">
          缺少必备证件：{{ result.certificateCheck.missing.map((item) => item.categoryLabel).join('、') }}
        </span>
      </div>
      <div class="overflow-x-auto rounded-lg border border-border bg-card">
        <table class="w-full text-[12px]">
          <thead class="bg-muted/60 text-muted-foreground">
            <tr>
              <th class="px-3 py-1.5 text-left font-medium">证件</th>
              <th class="px-3 py-1.5 text-left font-medium">类别</th>
              <th class="px-3 py-1.5 text-left font-medium">有效期至</th>
              <th class="px-3 py-1.5 text-left font-medium">扫描件</th>
              <th class="px-3 py-1.5 text-left font-medium">校验结果</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in result.certificateCheck.items" :key="item.id" class="border-t border-border">
              <td class="px-3 py-1.5">{{ item.name }}<span v-if="item.required" class="ml-1 text-[10px] text-red-500">必备</span></td>
              <td class="px-3 py-1.5 text-muted-foreground">{{ item.categoryLabel }}</td>
              <td class="px-3 py-1.5">{{ item.perpetual ? '长期' : item.validTo || '—' }}</td>
              <td class="px-3 py-1.5">{{ item.hasFile ? '已上传' : '未上传' }}</td>
              <td class="px-3 py-1.5">
                <span class="mr-1.5 inline-block rounded border px-1.5 py-0.5" :class="CERT_STYLE[item.status]">{{ item.statusLabel }}</span>
                <span class="text-muted-foreground">{{ item.message }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 待补充与核对 -->
    <div v-show="activeTab === 'todo'" class="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <div class="rounded-lg border border-border bg-card p-3">
        <h4 class="mb-1 text-[12px] font-medium">待补充资料（{{ result.pending.length }} 项）</h4>
        <p class="mb-2 text-[11px] text-muted-foreground">正文中以黄色高亮的“【待填：…】”标出；在“企业资料”中补全后重新生成即可消除。</p>
        <ul class="max-h-[420px] space-y-1 overflow-y-auto text-[12px]">
          <li v-for="(item, index) in result.pending" :key="index" class="flex gap-2 rounded border border-border px-2 py-1">
            <span class="shrink-0 text-muted-foreground">{{ index + 1 }}.</span>
            <span>{{ item.hint }}</span>
          </li>
          <li v-if="!result.pending.length" class="text-emerald-600">企业资料已齐全，没有待补充项。</li>
        </ul>
      </div>
      <div class="rounded-lg border border-border bg-card p-3">
        <h4 class="mb-1 text-[12px] font-medium">技术参数保证值核对清单（{{ result.reviewItems.length }} 项，其中 {{ result.stats.pendingValueCount }} 项待填）</h4>
        <p class="mb-2 text-[11px] text-muted-foreground">
          招标方给出确定值或限值的参数已直接响应；下列为招标方要求“投标人提供”的参数，系统按公式或行业典型值预填，须按本厂工艺文件 / 型式试验报告核对。
        </p>
        <div class="max-h-[420px] space-y-2 overflow-y-auto">
          <details v-for="[title, items] in reviewGroups" :key="title" class="rounded border border-border">
            <summary class="cursor-pointer px-2 py-1 text-[12px] font-medium">{{ title }} · {{ items.length }} 项</summary>
            <table class="w-full text-[11px]">
              <thead class="bg-muted/60 text-muted-foreground">
                <tr>
                  <th class="px-2 py-1 text-left font-medium">参数</th>
                  <th class="px-2 py-1 text-left font-medium">招标要求</th>
                  <th class="px-2 py-1 text-left font-medium">预填保证值</th>
                  <th class="px-2 py-1 text-left font-medium">来源</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in items" :key="item.number" class="border-t border-border">
                  <td class="px-2 py-1">{{ item.number }} {{ item.name }}</td>
                  <td class="px-2 py-1 text-muted-foreground">{{ item.required }}</td>
                  <td class="px-2 py-1" :class="item.basis === 'pending' ? 'text-red-600' : ''">{{ item.value }}</td>
                  <td class="px-2 py-1 text-muted-foreground">{{ item.basisLabel }}</td>
                </tr>
              </tbody>
            </table>
          </details>
          <p v-if="!result.reviewItems.length" class="text-[12px] text-muted-foreground">本包没有需要核对的技术参数。</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bid-score-scroll {
  max-width: 100%;
  max-height: 70vh;
  overflow: auto;
  scrollbar-gutter: stable;
  scrollbar-width: auto;
}
.bid-score-table {
  width: 100%;
  min-width: 1600px;
  table-layout: fixed;
}
.bid-score-table th,
.bid-score-table td {
  border-bottom: 1px solid var(--border);
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.bid-preview-host {
  max-height: 78vh;
  overflow: auto;
  border-radius: 6px;
  background: #e5e7eb;
}
.bid-preview-host :deep(.bid-docx-wrapper) {
  background: transparent;
  padding: 16px;
}
.bid-preview-host :deep(section.bid-docx) {
  margin-bottom: 16px;
  box-shadow: 0 1px 6px rgba(15, 23, 42, 0.18);
  color: #000;
}
</style>
