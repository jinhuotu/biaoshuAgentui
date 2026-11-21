<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { ArrowLeft, FileText, Loader2 } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import ClassicBidderSelect from '@/components/tenders/ClassicBidderSelect.vue'
import { ApiError } from '@/lib/api'
import { listTenderCompanies, type TenderCompany } from '@/lib/tender-companies-api'
import {
  createWorkbenchProject, listWorkbenchProjects, workbenchProject,
  type WorkbenchFields, type WorkbenchProject, type WorkbenchProjectSummary,
} from '@/lib/tender-workbench-api'

const route = useRoute()
const router = useRouter()
const projects = ref<WorkbenchProjectSummary[]>([])
const project = ref<WorkbenchProject | null>(null)
const companies = ref<TenderCompany[]>([])
const busy = ref('')
const error = ref('')
const notice = ref('')
const uploadErrors = ref<Record<string, string>>({})
const sourceFiles = ref<File[]>([])
const fields = ref<WorkbenchFields>({ projectName: '', tenderer: '', bidderName: '', tenderNo: '', bidderCompanyId: '' })
const chapterId = ref('')
const chapterText = ref('')
const suggestion = ref<{ text: string; notes: string[]; revision: number } | null>(null)
const preview = ref<'format' | 'output' | null>(null)
const previewBody = ref<HTMLElement | null>(null)
const previewError = ref('')
const previewBusy = ref(false)
let previewRequest = 0
let requestNumber = 0

const brief = computed(() => project.value?.brief ?? null)
const chapters = computed(() => brief.value?.outlineItems?.filter(
  item => !item.skipped && ['tech_plan', 'tech_chapter'].includes(item.kind),
) ?? [])
const activeChapter = computed(() => chapters.value.find(item => item.id === chapterId.value))
const chapterDirty = computed(() => Boolean(activeChapter.value && chapterText.value.trim() !== (activeChapter.value.draftBody || '').trim()))
const fieldNames = [
  { key: 'projectName', label: '项目名称' },
  { key: 'tenderer', label: '招标人' },
  { key: 'tenderNo', label: '招标编号' },
  { key: 'bidderName', label: '投标人全称' },
] as const
const fieldDirty = computed(() => Boolean(brief.value && (
  fieldNames.some(({ key }) => fields.value[key] !== (brief.value?.[key] || '')) ||
  (fields.value.bidderCompanyId || '') !== (brief.value.bidderCompanyId || '') ||
  (fields.value.legalPersonKey || '') !== (brief.value.legalPersonKey || '')
)))
const dirty = computed(() => fieldDirty.value || chapterDirty.value)
const needsFormat = computed(() => brief.value?.layoutMode === 'outline' && !brief.value.requirementsDriven && !brief.value.formatConfirmed)
const basicsMissing = computed(() => !brief.value?.projectName || !brief.value.tenderer || !brief.value.bidderName)
const representativeMissing = computed(() => (project.value?.legalPersons.length || 0) > 1 && !fields.value.legalPersonKey)
const missingSlots = computed(() => project.value?.allowedSlots.filter(
  slot => slot.required && !slot.inLibrary && !project.value?.attachments[slot.key],
) ?? [])
const chapterCount = computed(() => chapters.value.filter(item => item.draftBody?.trim()).length)
const sourceBySlot = computed(() => {
  const sources = new Map<string, { text: string; location: string }>()
  for (const rule of brief.value?.bidRequirements || []) {
    if (rule.slotKey && rule.text && !sources.has(rule.slotKey)) {
      sources.set(rule.slotKey, {
        text: rule.text,
        location: [rule.sourceChapter, rule.sourcePage ? `第 ${rule.sourcePage} 页` : ''].filter(Boolean).join(' · '),
      })
    }
  }
  return sources
})
const statusLabels = { ready: '编制中', warning: '等待读取', blocked: '读取待处理' }

function configureChapter(id: string) {
  chapterId.value = id
  chapterText.value = activeChapter.value?.draftBody || ''
  suggestion.value = null
}

function copyFields() {
  const value = brief.value
  fields.value = {
    projectName: value?.projectName || '', tenderer: value?.tenderer || '',
    bidderName: value?.bidderName || '', tenderNo: value?.tenderNo || '',
    bidderCompanyId: value?.bidderCompanyId || '',
    legalPersonKey: value?.legalPersonKey || '',
  }
}

function accept(next: WorkbenchProject, reset = false) {
  const keepFields = !reset && fieldDirty.value
  const keepChapter = !reset && chapterDirty.value
  project.value = next
  if (!keepFields) copyFields()
  if (reset || !activeChapter.value) configureChapter(next.lastChapterId || chapters.value[0]?.id || '')
  else if (!keepChapter) chapterText.value = activeChapter.value.draftBody || ''
  if (suggestion.value?.revision !== next.revision) suggestion.value = null
}

function allowNavigation() {
  if (busy.value) return false
  return !dirty.value || window.confirm('当前有未保存的项目字段或章节，确定离开吗？')
}

onBeforeRouteLeave(allowNavigation)
onBeforeRouteUpdate((to, from) => to.query.project === from.query.project || allowNavigation())

function warnOnUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', warnOnUnload)
  void listTenderCompanies().then(result => {
    companies.value = result.items.filter(company => company.active && company.canUse)
  }).catch(() => undefined)
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnOnUnload))

watch(() => route.query.project, async query => {
  const id = typeof query === 'string' ? query : ''
  const request = ++requestNumber
  sourceFiles.value = []
  uploadErrors.value = {}
  notice.value = ''
  error.value = ''
  if (id && project.value?.id === id) return
  project.value = null
  busy.value = '正在读取…'
  try {
    if (id) {
      const saved = await workbenchProject(id).get()
      if (request === requestNumber) accept(saved, true)
    } else {
      const items = await listWorkbenchProjects()
      if (request === requestNumber) projects.value = items
    }
  } catch (err) {
    if (request === requestNumber) error.value = message(err)
  } finally {
    if (request === requestNumber) busy.value = ''
  }
}, { immediate: true })

function message(err: unknown) {
  return err instanceof Error ? err.message : '操作失败，请重试'
}

async function run(label: string, fn: () => Promise<void>) {
  if (busy.value) return
  busy.value = label
  error.value = ''
  notice.value = ''
  try { await fn() }
  catch (err) { error.value = message(err) }
  finally { busy.value = '' }
}

function pickSources(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  sourceFiles.value = Array.from(input.files || [])
  input.value = ''
}

async function createProject() {
  let id = ''
  await run('正在保存招标文件…', async () => {
    const saved = await createWorkbenchProject(sourceFiles.value)
    accept(saved, true)
    id = saved.id
  })
  if (id) {
    await router.push({ query: { project: id } })
    await identify()
  }
}

function withProject(label: string, fn: (api: ReturnType<typeof workbenchProject>, current: WorkbenchProject) => Promise<void>) {
  const current = project.value
  if (!current) return
  return run(label, () => fn(workbenchProject(current.id), current))
}

function identify() {
  return withProject('正在读取招标文件，项目已保存…', async (api, current) => {
    accept(await api.identify(current.revision), true)
    if (project.value?.brief) notice.value = '已读取招标文件，请核对项目和待办。'
  })
}

function replaceSources() {
  return withProject('正在替换招标文件…', async (api, current) => {
    accept(await api.replaceSources(current.revision, sourceFiles.value), true)
    sourceFiles.value = []
    notice.value = '文件已保存，可以重新识别。'
  })
}

function chooseCompany(id: string) {
  const company = companies.value.find(item => item.id === id)
  fields.value.bidderCompanyId = id
  fields.value.legalPersonKey = ''
  if (company) fields.value.bidderName = company.name
}

async function writeFields(api: ReturnType<typeof workbenchProject>, current: WorkbenchProject) {
  const saved = await api.fields(current.revision, fields.value)
  accept(saved)
  copyFields()
  return saved
}

function saveFields() {
  return withProject('正在保存项目信息…', async (api, current) => {
    await writeFields(api, current)
    notice.value = '项目信息已保存。'
  })
}

function uploadFile(event: Event, key?: string) {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const feedbackKey = key ? `slot:${key}` : 'quote'
  uploadErrors.value[feedbackKey] = ''
  return withProject(key ? '正在校验附件…' : '正在识别报价清单…', async (api, current) => {
    try {
      const saved = key
        ? await api.attach(current.revision, key, file)
        : await api.quote(current.revision, file)
      accept(saved)
      notice.value = key ? '附件已保存到该待办。' : '报价已导入本项目。'
    } catch (err) {
      uploadErrors.value[feedbackKey] = message(err)
      if (err instanceof ApiError && err.status === 409) throw err
    }
  })
}

async function writeChapter(api: ReturnType<typeof workbenchProject>, current: WorkbenchProject) {
  const saved = await api.chapter(current.revision, chapterId.value, chapterText.value)
  accept(saved)
  chapterText.value = activeChapter.value?.draftBody || ''
  return saved
}

function saveChapter() {
  return withProject('正在保存本章…', async (api, current) => {
    await writeChapter(api, current)
    suggestion.value = null
    notice.value = '本章已保存。'
  })
}

function selectChapter(event: Event) {
  const input = event.currentTarget as HTMLSelectElement
  const id = input.value
  if (id === chapterId.value) return
  if (!chapterDirty.value) {
    configureChapter(id)
    return
  }
  input.value = chapterId.value
  return withProject('正在保存当前章节…', async (api, current) => {
    await writeChapter(api, current)
    configureChapter(id)
  })
}

function draftChapter() {
  return withProject('AI 正在起草本章…', async (api, current) => {
    if (fieldDirty.value) current = await writeFields(api, current)
    suggestion.value = await api.suggest(current.revision, chapterId.value)
  })
}

function useSuggestion() {
  const proposed = suggestion.value
  if (!proposed?.text) return
  return withProject('正在采纳本章草稿…', async api => {
    const saved = await api.chapter(proposed.revision, chapterId.value, proposed.text)
    accept(saved)
    chapterText.value = activeChapter.value?.draftBody || ''
    suggestion.value = null
    notice.value = '已保存本章，其他章节保留。'
  })
}

function previewDocument(kind: 'format' | 'output') {
  return withProject('正在打开 Word 预览…', async (api, current) => {
    if (kind === 'format' && !current.format) accept(await api.format(current.revision))
    const request = ++previewRequest
    preview.value = kind
    previewBusy.value = true
    previewError.value = ''
    await nextTick()
    try {
      const [blob, { renderAsync }] = await Promise.all([api.file(kind), import('docx-preview')])
      if (request === previewRequest && previewBody.value) await renderAsync(blob, previewBody.value)
    } catch (err) {
      if (request === previewRequest) previewError.value = message(err)
    } finally {
      if (request === previewRequest) previewBusy.value = false
    }
  })
}

function changePreview(open: boolean) {
  if (!open) {
    previewRequest++
    preview.value = null
  }
}

function confirmFormat() {
  return withProject('正在确认本标格式…', async (api, current) => {
    accept(await api.confirmFormat(current.revision))
    changePreview(false)
    notice.value = '格式已确认。'
  })
}

function generate() {
  return withProject('正在组装技术标 Word…', async (api, current) => {
    if (fieldDirty.value) current = await writeFields(api, current)
    if (chapterDirty.value) current = await writeChapter(api, current)
    accept(await api.generate(current.revision))
    notice.value = '技术标 Word 草稿已更新。'
  })
}

function downloadOutput() {
  return withProject('正在下载 Word 草稿…', async (api, current) => {
    if (current.output) await api.download('output', current.output.name)
  })
}
</script>

<template>
  <main class="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <RouterLink v-if="project" :to="{ path: route.path }" class="mb-2 inline-flex items-center gap-1 text-sm text-primary">
          <ArrowLeft class="size-4" /> 我的投标项目
        </RouterLink>
        <h1 class="text-2xl font-semibold tracking-tight">
          {{ brief?.projectName || project?.sources[0]?.name || '技术标工作台' }}
        </h1>
        <p v-if="project" class="mt-1 text-sm text-muted-foreground">
          {{ dirty ? '有未保存的修改' : '进度已保存，可随时继续' }}
        </p>
      </div>
      <a v-if="error && project" :href="router.resolve(route.fullPath).href" class="secondary">重新打开项目</a>
    </header>

    <p v-if="busy || notice" role="status" class="flex items-center gap-2 rounded-md bg-muted px-4 py-2 text-sm">
      <Loader2 v-if="busy" class="size-4 animate-spin" />{{ busy || notice }}
    </p>
    <p v-if="error" role="alert" class="rounded-md border border-destructive/35 px-4 py-2 text-sm text-destructive">{{ error }}</p>

    <template v-if="!project">
      <section class="surface max-w-2xl space-y-3">
        <h2 class="heading">新建投标项目</h2>
        <label class="file-action">
          选择招标文件 <span class="text-muted-foreground">Word，最多 5 份</span>
          <input type="file" accept=".doc,.docx" multiple :disabled="!!busy" @change="pickSources" />
        </label>
        <p v-if="sourceFiles.length" class="text-sm">{{ sourceFiles.map(file => file.name).join('、') }}</p>
        <button type="button" class="primary" :disabled="!sourceFiles.length || !!busy" @click="createProject">保存并读取文件</button>
      </section>

      <section v-if="projects.length" class="space-y-2">
        <h2 class="heading">继续我的项目</h2>
        <ul class="divide-y divide-border rounded-lg border border-border">
          <li v-for="item in projects" :key="item.id">
            <RouterLink :to="{ query: { project: item.id } }" class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted">
              <span class="flex min-w-0 items-center gap-2"><FileText class="size-4 shrink-0" /><span class="truncate">{{ item.name }}</span></span>
              <span class="shrink-0 text-sm text-muted-foreground">{{ statusLabels[item.status] }}</span>
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>

    <template v-else>
      <section v-if="!brief" class="surface space-y-3">
        <h2 class="heading">读取招标文件</h2>
        <ul class="text-sm"><li v-for="file in project.sources" :key="file.id">{{ file.name }}</li></ul>
        <p v-if="project.inputIssue" role="alert" class="text-sm text-destructive">{{ project.inputIssue }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="primary" :disabled="!!busy" @click="identify">{{ project.inputIssue ? '重试识别' : '读取招标文件' }}</button>
          <label class="file-action">选择替换文件<input type="file" accept=".doc,.docx" multiple :disabled="!!busy" @change="pickSources" /></label>
          <button v-if="sourceFiles.length" type="button" class="secondary" :disabled="!!busy" @click="replaceSources">保存替换文件</button>
        </div>
        <p v-if="sourceFiles.length" class="text-sm text-muted-foreground">{{ sourceFiles.map(file => file.name).join('、') }}</p>
      </section>

      <template v-else>
        <nav class="flex flex-wrap gap-x-4 gap-y-2 text-sm text-primary" aria-label="本项目操作">
          <a href="#workbench-fields">核对项目信息</a>
          <a href="#workbench-materials">补报价与资料{{ missingSlots.length ? `（${missingSlots.length} 项待补）` : '' }}</a>
          <a v-if="activeChapter" href="#workbench-chapters">继续编写技术章节</a>
        </nav>

        <section class="surface flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="heading">技术标草稿</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              已编写 {{ chapterCount }} / {{ chapters.length }} 章。
              {{ missingSlots.length ? `还有 ${missingSlots.length} 项识别出的必需资料待补。` : '' }}
              {{ project.output?.stale ? '旧版 Word 尚未包含最新修改。' : '' }}
              {{ basicsMissing ? '请先保存项目名称、招标人和投标人。' : needsFormat ? '请先查看并确认本标格式。' : representativeMissing ? '请选择本项目的法定代表人。' : '' }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="secondary" :disabled="!!busy" @click="previewDocument('format')">查看本标格式</button>
            <button type="button" class="primary" :disabled="!!busy || basicsMissing || needsFormat || representativeMissing" @click="generate">
              {{ project.output ? '更新技术标 Word' : '生成技术标 Word' }}
            </button>
          </div>
          <div v-if="project.output" class="flex w-full flex-wrap gap-2 border-t border-border pt-3">
            <button type="button" class="secondary" :disabled="!!busy" @click="previewDocument('output')">预览{{ project.output.stale ? '上一版' : '' }}草稿</button>
            <button type="button" class="secondary" :disabled="!!busy" @click="downloadOutput">下载{{ project.output.stale ? '上一版' : '' }}草稿</button>
            <details v-if="project.output.warnings.length" class="w-full text-sm">
              <summary class="cursor-pointer">查看组卷提醒（{{ project.output.warnings.length }}）</summary>
              <ul class="list-disc space-y-1 pl-5 pt-2"><li v-for="(item, index) in project.output.warnings" :key="index">{{ item }}</li></ul>
            </details>
          </div>
        </section>

        <section id="workbench-fields" class="surface scroll-mt-6">
          <form class="space-y-3" @submit.prevent="saveFields">
            <h2 class="heading">项目信息</h2>
            <div class="grid gap-3 sm:grid-cols-2">
              <ClassicBidderSelect v-if="companies.length || brief.bidderCompanyId" :company-id="fields.bidderCompanyId"
                :company-name="fields.bidderName" :companies="companies"
                :disabled="!!busy || !!brief.bidderCompanyId || Object.keys(project.attachments).length > 0" @select="chooseCompany" />
              <label v-for="field in fieldNames" :key="field.key" class="entry">
                {{ field.label }}
                <input v-model="fields[field.key]" maxlength="256" :disabled="!!busy ||
                  (field.key === 'bidderName' && (!!fields.bidderCompanyId || Object.keys(project.attachments).length > 0))" />
              </label>
              <label v-if="project.legalPersons.length" class="entry">
                法定代表人
                <select v-model="fields.legalPersonKey" :disabled="!!busy || fields.bidderCompanyId !== (brief.bidderCompanyId || '')">
                  <option value="">{{ project.legalPersons.length === 1 ? '采用资料库唯一候选' : '请选择本项目使用的人员' }}</option>
                  <option v-for="person in project.legalPersons" :key="person.key" :value="person.key">{{ person.name }}</option>
                </select>
              </label>
            </div>
            <button type="submit" class="secondary" :disabled="!!busy || !fieldDirty">保存项目信息</button>
          </form>
        </section>

        <section id="workbench-materials" class="surface scroll-mt-6 space-y-3">
          <h2 class="heading">补报价与技术资料</h2>
          <article class="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div>
              <h3 class="font-medium">报价清单</h3>
              <p class="text-sm text-muted-foreground">
                {{ project.quote ? `${project.quote.name} · ${brief.quoteLines?.length || 0} 行` : '可稍后导入，与项目现有章节一起保留。' }}
              </p>
              <p v-for="item in project.quoteNotes" :key="item" class="text-sm text-muted-foreground">{{ item }}</p>
              <p v-if="uploadErrors.quote" role="alert" class="text-sm text-destructive">{{ uploadErrors.quote }}</p>
            </div>
            <label class="file-action">
              {{ project.quote ? '替换报价' : '导入报价' }}
              <input type="file" accept=".xlsx,.xlsm,.docx,.csv" :disabled="!!busy || fieldDirty" @change="uploadFile($event)" />
            </label>
          </article>
          <p v-if="fieldDirty" class="text-sm text-muted-foreground">请先保存项目信息，再补报价或技术资料。</p>
          <p v-if="brief.techAnonymous" class="text-sm text-muted-foreground">技术暗标的扫描件需经过项目人工核验后单独处理。</p>
          <article v-for="slot in project.allowedSlots" :key="slot.key" class="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0">
            <div>
              <h3 class="font-medium">{{ slot.title }}</h3>
              <p class="text-sm text-muted-foreground">
                {{ project.attachments[slot.key]?.name || (slot.inLibrary ? '资料库有候选，生成时核对匹配' : slot.required ? '招标文件要求提供 · 待补' : '按项目需要提供') }}
              </p>
              <p v-if="uploadErrors[`slot:${slot.key}`]" role="alert" class="text-sm text-destructive">{{ uploadErrors[`slot:${slot.key}`] }}</p>
              <details v-if="sourceBySlot.has(slot.key)" class="mt-1 text-sm text-muted-foreground">
                <summary class="cursor-pointer">查看招标要求 {{ sourceBySlot.get(slot.key)?.location }}</summary>
                <p class="max-w-prose pt-1">{{ sourceBySlot.get(slot.key)?.text }}</p>
              </details>
            </div>
            <label class="file-action">
              {{ project.attachments[slot.key] ? '替换附件' : '上传附件' }}
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" :disabled="!!busy || fieldDirty || !brief.bidderName || brief.techAnonymous"
                @change="uploadFile($event, slot.key)" />
            </label>
          </article>
        </section>

        <section v-if="activeChapter" id="workbench-chapters" class="surface scroll-mt-6 space-y-3">
          <h2 class="heading">编制技术章节</h2>
          <label class="entry max-w-md">
            当前章节
            <select :value="chapterId" :disabled="!!busy" @change="selectChapter">
              <option v-for="item in chapters" :key="item.id" :value="item.id">{{ item.title }}{{ item.draftBody?.trim() ? '' : ' · 待编写' }}</option>
            </select>
          </label>
          <details v-if="activeChapter.inviteExcerpt" class="rounded-md bg-muted px-3 py-2 text-sm">
            <summary class="cursor-pointer">查看本章招标原文</summary>
            <p class="whitespace-pre-wrap pt-2">{{ activeChapter.inviteExcerpt }}</p>
          </details>
          <label class="entry">
            本章正文
            <textarea v-model="chapterText" rows="10" maxlength="100000" :disabled="!!busy" placeholder="编写本章正文，或先查看 AI 起草建议" />
          </label>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="primary" :disabled="!!busy || !chapterDirty" @click="saveChapter">保存本章</button>
            <button type="button" class="secondary" :disabled="!!busy" @click="draftChapter">AI 起草本章</button>
          </div>
          <div v-if="suggestion" class="space-y-2 rounded-md border border-border bg-muted p-3">
            <h3 class="font-medium">本章建议</h3>
            <p class="max-h-72 overflow-auto whitespace-pre-wrap text-sm">{{ suggestion.text || '未生成可用正文，请稍后重试或手动编写。' }}</p>
            <ul v-if="suggestion.notes.length" class="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li v-for="(note, index) in suggestion.notes" :key="index">{{ note }}</li>
            </ul>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="primary" :disabled="!!busy || !suggestion.text" @click="useSuggestion">用建议替换本章并保存</button>
              <button type="button" class="secondary" :disabled="!!busy" @click="suggestion = null">关闭建议</button>
            </div>
          </div>
        </section>

        <details v-if="project.notes.length" class="surface text-sm">
          <summary class="cursor-pointer font-medium">查看招标文件识别提示</summary>
          <ul class="list-disc space-y-1 pl-5 pt-2"><li v-for="(item, index) in project.notes" :key="index">{{ item }}</li></ul>
        </details>
      </template>
    </template>

    <AppDialog :open="!!preview" size="xl" :title="preview === 'format' ? '本标格式预览' : '技术标 Word 草稿'"
      @update:open="changePreview">
      <p v-if="previewBusy" role="status" class="p-3 text-sm">正在渲染 Word…</p>
      <p v-if="previewError" role="alert" class="p-3 text-sm text-destructive">{{ previewError }}</p>
      <p v-if="preview === 'format' && project?.format?.message" class="p-3 text-sm">{{ project.format.message }}</p>
      <div ref="previewBody" class="max-h-[65vh] overflow-auto rounded border border-border" />
      <div v-if="preview === 'format' && needsFormat" class="flex justify-end p-3">
        <button type="button" class="primary" :disabled="!!busy || !!previewError || previewBusy" @click="confirmFormat">确认使用此格式</button>
      </div>
    </AppDialog>
  </main>
</template>

<style scoped>
@reference "../style.css";
.surface { @apply rounded-lg border border-border bg-card p-4 sm:p-5; }
.heading { @apply text-base font-semibold; }
.primary, .secondary, .file-action { @apply inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors; }
.primary { @apply border-primary bg-primary text-primary-foreground hover:opacity-90; }
.secondary, .file-action { @apply border-border bg-background hover:bg-muted; }
.primary:disabled, .secondary:disabled { @apply cursor-not-allowed opacity-50; }
.file-action { @apply relative cursor-pointer; }
.file-action:focus-within { @apply outline-2 outline-primary; }
.file-action:has(input:disabled) { @apply cursor-not-allowed opacity-50; }
.file-action input { @apply absolute inset-0 size-full cursor-pointer opacity-0; }
.entry { @apply block text-sm; }
.entry input, .entry select, .entry textarea { @apply mt-1 block w-full rounded-md border border-border bg-background px-3 py-2; }
</style>
