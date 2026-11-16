<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, Check, FileArchive, FolderOpen, History, RefreshCw, Sparkles, Trash2, UploadCloud } from 'lucide-vue-next'
import { PageHeader, Panel } from '@/components/ui-kit'
import BidGenCorpusPanel from '@/components/bid-gen/BidGenCorpusPanel.vue'
import BidGenProfilePanel from '@/components/bid-gen/BidGenProfilePanel.vue'
import BidGenResultPanel from '@/components/bid-gen/BidGenResultPanel.vue'
import BidGenTenderPanel from '@/components/bid-gen/BidGenTenderPanel.vue'
import { prepareDroppedBidUpload, prepareSelectedBidUpload } from '@/lib/bid-gen-upload'
import {
  deleteBidTask,
  fetchBidTask,
  generateBid,
  listBidTasks,
  uploadTenderArchive,
  type BidTask,
  type BidTaskSummary,
  type CertificateCheck,
} from '@/lib/bid-gen-api'

const STEPS = [
  { title: '上传招标文件', hint: '压缩包 / 嵌套压缩包' },
  { title: '解析确认', hint: '分标 · 评分 · 格式' },
  { title: '企业资料与证件', hint: '资料补全 · 效期校验' },
  { title: '生成与自查', hint: 'Word · 评分自查' },
] as const

const route = useRoute()
const router = useRouter()

const stepIndex = ref(0)
const task = ref<BidTask | null>(null)
const tasks = ref<BidTaskSummary[]>([])
const busy = ref<'' | 'upload' | 'open' | 'generate'>('')
const errorMessage = ref('')
const dragging = ref(false)
const lotCodes = ref<string[]>([])
const packageNo = ref('')
const signDate = ref('')
const certificateCheck = ref<CertificateCheck | null>(null)
const profilePanel = ref<InstanceType<typeof BidGenProfilePanel> | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)
const uploadMessage = ref('')

const maxStep = computed(() => (!task.value ? 0 : task.value.result ? 3 : 2))
const certificateIssues = computed(() =>
  certificateCheck.value ? certificateCheck.value.summary.expired + certificateCheck.value.missing.length : 0,
)

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function applyTask(next: BidTask, step: number) {
  task.value = next
  lotCodes.value = [...next.selection.lotCodes]
  packageNo.value = next.selection.packageNo
  signDate.value = next.selection.signDate
  stepIndex.value = step
  void router.replace({ path: route.path, query: { id: next.id } })
}

async function refreshTasks() {
  tasks.value = await listBidTasks()
}

async function upload(prepare: () => Promise<File>) {
  if (busy.value) return
  errorMessage.value = ''
  busy.value = 'upload'
  uploadMessage.value = '正在读取文件并打包…'
  try {
    const file = await prepare()
    uploadMessage.value = '正在上传并解析…'
    applyTask(await uploadTenderArchive(file), 1)
    await refreshTasks()
  } catch (error) {
    errorMessage.value = describeError(error)
  } finally {
    busy.value = ''
    uploadMessage.value = ''
  }
}

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length) return upload(() => prepareSelectedBidUpload(files))
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const transfer = event.dataTransfer
  if (transfer) return upload(() => prepareDroppedBidUpload(transfer))
}

async function openTask(id: string) {
  busy.value = 'open'
  errorMessage.value = ''
  try {
    const next = await fetchBidTask(id)
    applyTask(next, next.result ? 3 : 1)
  } catch (error) {
    errorMessage.value = describeError(error)
  } finally {
    busy.value = ''
  }
}

async function removeTask(id: string) {
  if (!window.confirm('确定删除这条生成记录及其文件吗？删除后不可恢复。')) return
  try {
    await deleteBidTask(id)
    if (task.value?.id === id) startOver()
    await refreshTasks()
  } catch (error) {
    errorMessage.value = describeError(error)
  }
}

function startOver() {
  task.value = null
  stepIndex.value = 0
  errorMessage.value = ''
  void router.replace({ path: route.path })
}

async function generate() {
  if (!task.value) return
  errorMessage.value = ''
  if (task.value.tender.lots.length && !lotCodes.value.length) {
    errorMessage.value = '请先在“解析确认”中至少选择一个所投分标'
    stepIndex.value = 1
    return
  }
  busy.value = 'generate'
  try {
    // 生成前自动保存企业资料，避免未保存的修改没进标书
    if (profilePanel.value && !(await profilePanel.value.save(true))) return
    const next = await generateBid(task.value.id, {
      lotCodes: lotCodes.value,
      packageNo: packageNo.value,
      signDate: signDate.value,
      includeScoreIndex: true,
    })
    applyTask(next, 3)
    await refreshTasks()
  } catch (error) {
    errorMessage.value = describeError(error)
  } finally {
    busy.value = ''
  }
}

function goStep(index: number) {
  if (index <= maxStep.value || index <= stepIndex.value) stepIndex.value = index
}

onMounted(async () => {
  try {
    await refreshTasks()
    if (typeof route.query.id === 'string') await openTask(route.query.id)
  } catch (error) {
    errorMessage.value = describeError(error)
  }
})
</script>

<template>
  <div>
    <PageHeader
      title="AI标书生成"
      description="上传招标文件、文件夹或压缩包（支持压缩包套压缩包），由本地规则算法解析并生成带多级目录的 Word 投标文件，全程不调用大模型接口；生成后自动对照评分标准自查，并校验证件有效期。"
    >
      <template #actions>
        <RouterLink to="/tenders-classic" class="rounded-md border border-border px-3 py-1.5 text-[12px] text-muted-foreground hover:border-primary hover:text-primary">
          旧版（模型生成）
        </RouterLink>
        <button
          v-if="task"
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[12px] hover:border-primary hover:text-primary"
          @click="startOver"
        >
          <UploadCloud class="size-3.5" />新建任务
        </button>
      </template>
    </PageHeader>

    <!-- 步骤条 -->
    <ol class="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
      <li v-for="(step, index) in STEPS" :key="step.title">
        <button
          type="button"
          class="flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors"
          :class="[
            index === stepIndex ? 'border-primary bg-primary/5' : 'border-border bg-card',
            index <= maxStep ? 'cursor-pointer hover:border-primary/60' : 'cursor-not-allowed opacity-55',
          ]"
          :disabled="index > maxStep"
          @click="goStep(index)"
        >
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
            :class="index < stepIndex || (index === 3 && task?.result) ? 'bg-emerald-500 text-white' : index === stepIndex ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
          >
            <Check v-if="index < stepIndex || (index === 3 && task?.result && stepIndex !== 3)" class="size-3.5" />
            <template v-else>{{ index + 1 }}</template>
          </span>
          <span class="min-w-0">
            <span class="block truncate text-[13px] font-medium">{{ step.title }}</span>
            <span class="block truncate text-[11px] text-muted-foreground">{{ step.hint }}</span>
          </span>
        </button>
      </li>
    </ol>

    <p v-if="errorMessage" role="alert" class="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
      {{ errorMessage }}
    </p>

    <!-- 1 上传 -->
    <div v-show="stepIndex === 0" class="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
      <Panel title="上传招标文件">
        <div
          class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors"
          :class="dragging ? 'border-primary bg-primary/5' : 'border-border'"
          @dragover.prevent="dragging = !busy"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <FileArchive class="size-10 text-primary" />
          <p class="mt-3 text-[14px] font-medium">把招标文件、文件夹或压缩包拖到这里</p>
          <p class="mt-1 text-[12px] text-muted-foreground">
            支持 .zip、.rar、.docx、.pdf，可一次选择多个文件；文件夹自动打包并保留目录层级，总大小不超过 200MB
          </p>
          <button
            type="button"
            class="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[13px] text-primary-foreground disabled:opacity-50"
            :disabled="!!busy"
            @click="fileInput?.click()"
          >
            <UploadCloud class="size-4" />{{ busy === 'upload' ? uploadMessage : '选择招标文件' }}
          </button>
          <button type="button" class="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-[13px] disabled:opacity-50" :disabled="!!busy" @click="folderInput?.click()">
            <FolderOpen class="size-4" />选择文件夹
          </button>
          <input ref="fileInput" type="file" accept=".zip,.rar,.docx,.pdf" multiple class="hidden" @change="onFileSelected">
          <input ref="folderInput" type="file" webkitdirectory multiple class="hidden" @change="onFileSelected">
        </div>
        <ul class="mt-4 grid grid-cols-1 gap-2 text-[12px] text-muted-foreground md:grid-cols-2">
          <li class="rounded-md border border-border p-2.5"><b class="text-foreground">按客户格式生成</b>：目录顺序、条目名称取自招标文件第六章“投标文件格式目录”，不适用项自动标注。</li>
          <li class="rounded-md border border-border p-2.5"><b class="text-foreground">评分标准自查</b>：逐条抽取商务 / 技术评分细则，生成后核对每个评分项的响应章节与可得档位。</li>
          <li class="rounded-md border border-border p-2.5"><b class="text-foreground">证件效期校验</b>：身份证、营业执照及各类证书按投标截止日和投标有效期校验是否过期。</li>
          <li class="rounded-md border border-border p-2.5"><b class="text-foreground">标准 Word 文件</b>：输出 .docx，使用 Word 标题样式与自动目录，逐份抄录技术规范书参数表，内容更完整。</li>
        </ul>
      </Panel>
      <Panel title="生成记录">
        <template #action>
          <button type="button" class="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-primary" @click="refreshTasks">
            <RefreshCw class="size-3.5" />刷新
          </button>
        </template>
        <ul class="space-y-2">
          <li v-for="item in tasks" :key="item.id" class="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-[12px]">
            <History class="size-4 shrink-0 text-muted-foreground" />
            <button type="button" class="min-w-0 flex-1 text-left hover:text-primary" @click="openTask(item.id)">
              <span class="block truncate font-medium">{{ item.projectName || item.archiveName }}</span>
              <span class="block truncate text-[11px] text-muted-foreground">
                {{ item.tenderNo }} · {{ item.updatedAt.replace('T', ' ') }} ·
                {{ item.status === 'generated' ? `已生成（约 ${item.estimatedPages} 页）` : '已解析，待生成' }}
              </span>
            </button>
            <button type="button" class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="删除记录" @click="removeTask(item.id)">
              <Trash2 class="size-3.5" />
            </button>
          </li>
          <li v-if="!tasks.length" class="py-6 text-center text-[12px] text-muted-foreground">还没有生成记录</li>
        </ul>
      </Panel>
      <Panel title="历史标书库" subtitle="导入公司往期投标文件，生成时按评分点复用同类章节（自动替换为本项目名称）。">
        <BidGenCorpusPanel />
      </Panel>
    </div>

    <!-- 2 解析确认 -->
    <Panel v-if="task" v-show="stepIndex === 1" :title="`解析结果 · ${task.archiveName}`">
      <BidGenTenderPanel v-model:lot-codes="lotCodes" v-model:package-no="packageNo" v-model:sign-date="signDate" :task="task" />
    </Panel>

    <!-- 3 企业资料 -->
    <Panel v-if="task" v-show="stepIndex === 2" title="投标人企业资料与证件库" subtitle="根据投标资料库中的已有数据自动匹配；未匹配到的内容再手动补充，生成标书时使用当前资料。">
      <BidGenProfilePanel
        ref="profilePanel"
        :task-id="task.id"
        :bid-deadline="task.tender.bidDeadline"
        :validity-end="task.tender.validityEnd"
        @checked="certificateCheck = $event"
      />
    </Panel>

    <!-- 4 结果 -->
    <div v-if="task?.result" v-show="stepIndex === 3">
      <BidGenResultPanel :task="task" />
    </div>

    <!-- 底部操作 -->
    <div v-if="task && stepIndex > 0" class="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 backdrop-blur">
      <button type="button" class="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[12px] hover:border-primary" @click="stepIndex -= 1">
        <ArrowLeft class="size-3.5" />上一步
      </button>
      <span v-if="certificateIssues && stepIndex >= 2" class="text-[12px] text-red-600">
        证件库有 {{ certificateIssues }} 项过期或缺失，建议先处理；仍可继续生成。
      </span>
      <span class="flex-1" />
      <button
        v-if="stepIndex === 1"
        type="button"
        class="inline-flex items-center gap-1 rounded-md border border-primary px-3 py-1.5 text-[12px] text-primary hover:bg-primary/5"
        @click="stepIndex = 2"
      >
        下一步：企业资料与证件<ArrowRight class="size-3.5" />
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-[13px] text-primary-foreground disabled:opacity-50"
        :disabled="busy === 'generate'"
        @click="generate"
      >
        <Sparkles class="size-4" />
        {{ busy === 'generate' ? '正在生成…' : task.result ? '按当前资料重新生成' : '生成投标文件' }}
      </button>
    </div>
  </div>
</template>
