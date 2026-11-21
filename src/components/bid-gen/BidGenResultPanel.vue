<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { renderAsync } from 'docx-preview'
import { AlertTriangle, CheckCircle2, CircleDashed, Download, FileText, ShieldCheck } from 'lucide-vue-next'
import BidGenOutlineTree from './BidGenOutlineTree.vue'
import {
  downloadBidFile,
  fetchBidFileBlob,
  type BidTask,
  type CertificateStatus,
  type ScoreCheckItem,
  type ScoreStatus,
} from '@/lib/bid-gen-api'

const props = defineProps<{ task: BidTask; recordId?: string }>()

const TABS = [
  { key: 'risk', label: '风险自查与分析' },
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

const activeTab = ref<(typeof TABS)[number]['key']>('risk')
const scoreFilter = ref<ScoreStatus | 'all'>('all')
const previewFile = ref('')
const previewHost = ref<HTMLElement | null>(null)
const previewState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const previewError = ref('')
const downloading = ref('')
const errorMessage = ref('')
let previewToken = 0

const result = computed(() => props.task.result!)
const hasScoreResults = computed(() => result.value.scoreCheck.available ?? !!result.value.scoreCheck.items.length)
const wordFiles = computed(() => result.value.files.filter((file) => file.name.endsWith('.docx')))
const scoreItems = computed<ScoreCheckItem[]>(() =>
  result.value.scoreCheck.items.filter((item) => scoreFilter.value === 'all' || item.status === scoreFilter.value),
)
const scoreGroups = computed(() => {
  const groups: { title: string; items: ScoreCheckItem[] }[] = []
  for (const item of scoreItems.value) {
    const title = `${item.volume === 'business' ? '商务评分' : `技术评分${item.category ? `（${item.category}）` : ''}`} · ${item.group}`
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
  if (item.maxScore === null) return '—'
  // 定额评分项（如“（6分）”）只有上限
  if (item.minScore === null) return `${item.maxScore}`
  return `${item.minScore} ~ ${item.maxScore}`
}

async function download(name: string) {
  downloading.value = name
  errorMessage.value = ''
  try {
    await downloadBidFile(props.task.id, name, props.recordId)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    downloading.value = ''
  }
}

async function renderPreview() {
  const host = previewHost.value
  if (!host || !previewFile.value) return
  const token = ++previewToken
  previewState.value = 'loading'
  previewError.value = ''
  try {
    const blob = await fetchBidFileBlob(props.task.id, previewFile.value, props.recordId)
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

watch(() => [props.task.id, props.task.result?.generatedAt], () => {
  previewToken += 1
  previewFile.value = ''
  previewState.value = 'idle'
  previewError.value = ''
  errorMessage.value = ''
  activeTab.value = 'risk'
})

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
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
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
        <p v-if="hasScoreResults" class="mt-1 text-xl font-semibold" :class="result.scoreCheck.passed ? 'text-emerald-600' : 'text-amber-600'">{{ result.scoreCheck.coverage }}%</p>
        <p v-else class="mt-1 text-sm font-semibold text-amber-700">无法核验</p>
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
      <p v-if="!hasScoreResults" class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
        {{ task.tender.criteria.length ? '当前生成稿没有评分自查条目，请核对所投品类后重新生成。' : '未识别到可核验的评分标准，请核对招标正文和评分附件。' }}
      </p>
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div v-for="volume in result.scoreCheck.volumes" :key="volume.volume" class="rounded-lg border border-border bg-card p-3 text-[12px]">
          <div class="flex items-center justify-between">
            <span class="font-medium">{{ volume.label }}（共 {{ volume.total }} 项）</span>
            <span v-if="volume.estimatedCount !== 0">
              可量化项预估 <b class="text-[15px] text-primary">{{ volume.estimatedScore }}</b> / {{ volume.maxScore }} 分
            </span>
            <span v-else class="text-muted-foreground">待核验</span>
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
      <div v-if="hasScoreResults" class="flex flex-wrap items-center gap-1.5 text-[12px]">
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
          {{ result.scoreCheck.readBack ? '已回读生成的 Word 文件，逐项确认响应章节真实存在' : '按章节结构核对' }}
        </span>
      </div>
      <div v-for="group in scoreGroups" :key="group.title" class="overflow-hidden rounded-lg border border-border bg-card">
        <h4 class="border-b border-border bg-muted/50 px-3 py-1.5 text-[12px] font-medium">{{ group.title }}</h4>
        <div v-for="item in group.items" :key="item.criterionId" class="grid grid-cols-1 gap-x-4 gap-y-1 border-b border-border px-3 py-2.5 text-[12px] last:border-b-0 lg:grid-cols-[220px_1fr_1fr]">
          <div>
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
          </div>
          <div>
            <p class="text-[11px] text-muted-foreground">评审细则</p>
            <p class="whitespace-pre-line leading-relaxed">{{ item.rule }}</p>
          </div>
          <div>
            <p class="text-[11px] text-muted-foreground">响应章节</p>
            <p v-if="item.sections.length">{{ item.sections.map((section) => section.heading).join('；') }}</p>
            <p v-else class="text-muted-foreground">
              {{ item.status === 'external' ? (item.sourcePath ? '按评分细则核对资料要求' : '无需投标文件响应') : '未找到响应章节' }}
            </p>
            <p v-if="item.basis" class="mt-1"><span class="text-[11px] text-muted-foreground">判定依据：</span>{{ item.basis }}</p>
            <ul v-if="item.advice.length" class="mt-1 list-disc pl-4 text-amber-700">
              <li v-for="advice in item.advice" :key="advice">{{ advice }}</li>
            </ul>
          </div>
        </div>
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

    <!-- 风险自查与招标文件分析 -->
    <div v-show="activeTab === 'risk'" class="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <div class="rounded-lg border border-border bg-card p-3">
        <h4 class="mb-1 text-[12px] font-medium">废标风险自查（{{ result.riskCheck?.length ?? 0 }} 项）</h4>
        <p class="mb-2 text-[11px] text-muted-foreground">交标前逐项处理；完整内容见下载文件中的《分析与风险自查报告》。</p>
        <ul class="max-h-[480px] space-y-1.5 overflow-y-auto text-[12px]">
          <li v-for="(risk, index) in result.riskCheck ?? []" :key="index" class="rounded border px-2 py-1.5"
              :class="risk.level === '高' ? 'border-red-200 bg-red-50' : risk.level === '中' ? 'border-amber-200 bg-amber-50' : 'border-border'">
            <p><span class="mr-1 font-semibold" :class="risk.level === '高' ? 'text-red-700' : risk.level === '中' ? 'text-amber-700' : 'text-muted-foreground'">[{{ risk.level }}] {{ risk.item }}</span>{{ risk.detail }}</p>
            <p class="mt-0.5 text-[11px] text-muted-foreground">建议：{{ risk.suggestion }}</p>
          </li>
          <li v-if="!result.riskCheck?.length" class="text-emerald-600">未发现废标风险。</li>
        </ul>
      </div>
      <div v-if="result.analysis" class="rounded-lg border border-border bg-card p-3 text-[12px]">
        <h4 class="mb-2 text-[12px] font-medium">招标文件分析</h4>
        <dl class="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1">
          <template v-for="item in result.analysis.basics" :key="item.label">
            <dt class="text-muted-foreground">{{ item.label }}</dt><dd>{{ item.value }}</dd>
          </template>
        </dl>
        <p v-if="result.analysis.scoreGroups.length" class="mt-2">
          分值构成：<span v-for="group in result.analysis.scoreGroups" :key="group.group" class="mr-2">{{ group.group }} {{ group.maxScore }}分</span>
        </p>
        <details v-if="result.analysis.vetoClauses.length" class="mt-2">
          <summary class="cursor-pointer text-red-700">否决与实质性条款（{{ result.analysis.vetoClauses.length }} 条）</summary>
          <ol class="mt-1 list-inside list-decimal space-y-1"><li v-for="(text, index) in result.analysis.vetoClauses" :key="index">{{ text }}</li></ol>
        </details>
        <details v-if="result.coverage?.length" class="mt-2">
          <summary class="cursor-pointer">评分点覆盖自检（{{ result.coverage.length }} 项）</summary>
          <ul class="mt-1 space-y-1">
            <li v-for="item in result.coverage" :key="item.factor">{{ item.factor }}：{{ item.aspects.join('、') || '—' }}<span v-if="item.added.length" class="text-amber-700">（已补写：{{ item.added.join('、') }}）</span></li>
          </ul>
        </details>
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
