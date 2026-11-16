<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertTriangle, CheckCircle2, Database, FileImage, Plus, RefreshCw, Save, ShieldCheck, Trash2, Upload } from 'lucide-vue-next'
import BidGenRowEditor, { type RowColumn } from './BidGenRowEditor.vue'
import {
  checkCertificates,
  fetchCompanyProfile,
  saveCompanyProfile,
  uploadCertificateFile,
  type Certificate,
  type CertificateCategory,
  type CertificateCheck,
  type CertificateStatus,
  type CompanyProfile,
  type LibraryMatch,
} from '@/lib/bid-gen-api'

const props = defineProps<{ taskId: string; bidDeadline: string; validityEnd: string }>()
const emit = defineEmits<{ saved: []; checked: [check: CertificateCheck] }>()

type FieldDef = { key: string; label: string; wide?: boolean; multiline?: boolean; placeholder?: string }

const TABS = [
  { key: 'base', label: '基本信息' },
  { key: 'people', label: '人员与财务' },
  { key: 'capability', label: '生产能力与创新' },
  { key: 'certificates', label: '证件库与效期校验' },
] as const

const COMPANY_FIELDS: FieldDef[] = [
  { key: 'name', label: '投标人名称' },
  { key: 'creditCode', label: '统一社会信用代码' },
  { key: 'address', label: '注册地址' },
  { key: 'postcode', label: '邮政编码' },
  { key: 'contact', label: '联系人' },
  { key: 'phone', label: '联系电话' },
  { key: 'fax', label: '传真' },
  { key: 'website', label: '网址' },
  { key: 'foundedDate', label: '成立时间', placeholder: '如 2007-06-25' },
  { key: 'registeredCapital', label: '注册资金' },
  { key: 'bank', label: '开户银行' },
  { key: 'bankAccount', label: '银行账号' },
  { key: 'orgStructure', label: '组织结构', wide: true },
  { key: 'businessScope', label: '经营范围', wide: true, multiline: true },
  { key: 'intro', label: '企业简介', wide: true, multiline: true },
  { key: 'honors', label: '资质荣誉', wide: true, multiline: true },
]
const PERSON_FIELDS: FieldDef[] = [
  { key: 'name', label: '姓名' },
  { key: 'title', label: '职务 / 职称' },
  { key: 'phone', label: '电话' },
]
const STAFF_FIELDS: FieldDef[] = [
  { key: 'total', label: '员工总人数' },
  { key: 'senior', label: '高级及以上职称 + 高级技师' },
  { key: 'seniorEngineers', label: '与投标产品相关的高级工程师' },
  { key: 'middle', label: '中级职称' },
  { key: 'junior', label: '初级职称' },
  { key: 'technicians', label: '技工' },
]
const SERVICE_FIELDS: FieldDef[] = [
  { key: 'provinceCount', label: '售后网点覆盖省份数' },
  { key: 'hotline', label: '服务热线' },
  { key: 'responseHours', label: '响应时限（小时）' },
  { key: 'arrivalHours', label: '到场时限（小时）' },
  { key: 'provinces', label: '覆盖省份清单', wide: true },
]
const DECLARATIONS: { key: string; label: string }[] = [
  { key: 'greenPlan', label: '已建立绿色发展规划制度' },
  { key: 'innovationIncentive', label: '已制定创新激励政策和机制' },
  { key: 'supplyChainMeasures', label: '已制定供应链保障措施' },
  { key: 'emergencyProof', label: '有应急抢险保电突出贡献证明' },
  { key: 'greenRecycling', label: '已建立绿色生产和绿色回收制度' },
  { key: 'esgReport', label: '已发布 ESG 报告' },
  { key: 'eiaReport', label: '有环评 / 能评报告' },
  { key: 'wasteReport', label: '有废水 / 废气 / 废固报告' },
  { key: 'processDocsComplete', label: '主要工序工艺文件齐全' },
  { key: 'materialDocsComplete', label: '原材料 / 组部件管理文件齐全' },
  { key: 'noAdverseRecord', label: '无不良行为、失信及抽检扣分情形' },
  { key: 'noStateGridRelation', label: '与国网系统人员无需说明的关系' },
  { key: 'nameChanged', label: '资格预审后发生过企业名称变更' },
]

const SHAREHOLDER_COLUMNS: RowColumn[] = [
  { key: 'name', label: '股东名称' },
  { key: 'amount', label: '出资金额（万元）', width: '130px' },
  { key: 'ratio', label: '出资比例（%）', width: '110px' },
  { key: 'kind', label: '股东类型', width: '110px', placeholder: '企业法人 / 自然人' },
]
const FINANCE_COLUMNS: RowColumn[] = [
  { key: 'year', label: '年度', width: '70px' },
  { key: 'revenue', label: '主营收入（万元）' },
  { key: 'paidCapital', label: '实收资本（万元）' },
  { key: 'debtRatio', label: '资产负债率' },
  { key: 'currentRatio', label: '流动比率' },
  { key: 'roe', label: '净资产收益率' },
  { key: 'cashRatio', label: '现金比率' },
  { key: 'rdExpense', label: '研发费（万元）' },
  { key: 'rdRatio', label: '研发费占比', placeholder: '如 3.2%' },
]
const EQUIPMENT_COLUMNS: RowColumn[] = [
  { key: 'name', label: '设备类别' },
  { key: 'count', label: '数量', width: '90px' },
  { key: 'unit', label: '单位', width: '70px' },
]
const TEST_EQUIPMENT_COLUMNS: RowColumn[] = [
  { key: 'name', label: '试验设备名称' },
  { key: 'count', label: '数量', width: '80px' },
  { key: 'usage', label: '用途' },
]
const PERFORMANCE_COLUMNS: RowColumn[] = [
  { key: 'project', label: '项目 / 合同名称' },
  { key: 'buyer', label: '买方' },
  { key: 'product', label: '产品' },
  { key: 'quantity', label: '数量', width: '90px' },
  { key: 'unit', label: '单位', width: '70px' },
  { key: 'year', label: '年份', width: '70px' },
]
const PATENT_COLUMNS: RowColumn[] = [
  { key: 'name', label: '专利名称' },
  { key: 'number', label: '专利号' },
  { key: 'kind', label: '类型', width: '110px', placeholder: '发明 / 实用新型' },
]
const STANDARD_COLUMNS: RowColumn[] = [
  { key: 'name', label: '标准名称 / 编号' },
  { key: 'level', label: '级别', width: '130px', placeholder: '国家 / 行业 / 团体 / 企业' },
]
const AWARD_COLUMNS: RowColumn[] = [
  { key: 'name', label: '科技成果 / 奖励名称' },
  { key: 'level', label: '级别', width: '110px', placeholder: '国家级 / 省部级' },
  { key: 'year', label: '年份', width: '80px' },
]

const STATUS_STYLE: Record<CertificateStatus, string> = {
  valid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  expiring: 'bg-amber-50 text-amber-700 border-amber-200',
  insufficient: 'bg-orange-50 text-orange-700 border-orange-200',
  expired: 'bg-red-50 text-red-700 border-red-200',
  unknown: 'bg-slate-50 text-slate-600 border-slate-200',
}

const profile = ref<CompanyProfile | null>(null)
const libraryMatch = ref<LibraryMatch | null>(null)
const categories = ref<CertificateCategory[]>([])
const check = ref<CertificateCheck | null>(null)
const activeTab = ref<(typeof TABS)[number]['key']>('base')
const loading = ref(true)
const saving = ref(false)
const message = ref('')
const errorMessage = ref('')
const systemsText = ref('')
const uploadingId = ref('')

const checkById = computed(() => new Map((check.value?.items ?? []).map((item) => [item.id, item])))
const blockingCount = computed(() => (check.value ? check.value.summary.expired + check.value.missing.length : 0))

function applyProfile(next: CompanyProfile) {
  profile.value = next
  systemsText.value = next.systems.join('、')
}

function fieldSource(section: string, key: string): string {
  return (libraryMatch.value?.sources[`${section}.${key}`] ?? []).map((source) => source.name || source.title).join('、')
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    const data = await fetchCompanyProfile()
    applyProfile(data.profile)
    libraryMatch.value = data.libraryMatch
    categories.value = data.certificateCategories
    await runCheck()
    return true
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
    return false
  } finally {
    loading.value = false
  }
}

async function runCheck() {
  check.value = await checkCertificates(props.taskId)
  emit('checked', check.value)
}

async function save(silent = false): Promise<boolean> {
  if (!profile.value || loading.value || saving.value) return false
  saving.value = true
  errorMessage.value = ''
  message.value = ''
  try {
    profile.value.systems = systemsText.value
      .split(/[、,，;；\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
    const data = await saveCompanyProfile(profile.value)
    applyProfile(data.profile)
    await runCheck()
    if (!silent) message.value = '企业资料已保存，证件效期已重新校验'
    emit('saved')
    return true
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
    return false
  } finally {
    saving.value = false
  }
}

async function refreshLibrary() {
  if (loading.value || saving.value) return
  // 先保存当前人工补充，重新读取资料库时由服务端保留这些修改。
  if (profile.value && !(await save(true))) return
  await load()
}

function addCertificate() {
  if (!profile.value) return
  const certificate: Certificate = {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    category: 'other',
    name: '',
    number: '',
    issuer: '',
    validFrom: '',
    validTo: '',
    perpetual: false,
    fileName: '',
    storedFile: '',
  }
  profile.value.certificates.push(certificate)
}

function removeCertificate(id: string) {
  if (!profile.value) return
  profile.value.certificates = profile.value.certificates.filter((item) => item.id !== id)
}

function onCategoryChange(certificate: Certificate) {
  if (certificate.name) return
  certificate.name = categories.value.find((item) => item.key === certificate.category)?.label ?? ''
}

async function onScanSelected(certificate: Certificate, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  uploadingId.value = certificate.id
  errorMessage.value = ''
  message.value = ''
  try {
    // 先保存，保证后端已有这条证件记录
    if (!(await save(true))) return
    const data = await uploadCertificateFile(certificate.id, file)
    applyProfile(data.profile)
    await runCheck()
    message.value = data.recognized
      ? '扫描件已上传，并自动识别出有效期，请核对'
      : '扫描件已上传；未能自动识别有效期，请手工填写“有效期至”或勾选长期有效'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    uploadingId.value = ''
  }
}

defineExpose({ save, load })
onMounted(load)
</script>

<template>
  <div>
    <div v-if="errorMessage" role="alert" class="mb-3 flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
      <span class="flex-1">{{ errorMessage }}</span>
      <button type="button" class="shrink-0 underline" :disabled="loading || saving" @click="refreshLibrary">重新读取</button>
    </div>
    <div v-if="loading" role="status" class="py-10 text-center text-[13px] text-muted-foreground">正在根据投标资料库自动匹配企业资料与证件…</div>
    <template v-else-if="profile">
      <div class="mb-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 text-[12px]">
        <div class="flex flex-wrap items-center gap-2">
          <Database class="size-4 shrink-0 text-primary" />
          <span class="font-medium">根据投标资料库自动匹配</span>
          <span v-if="libraryMatch?.documentCount" class="text-muted-foreground">
            已读取 {{ libraryMatch.documentCount }} 份资料，匹配 {{ libraryMatch.matchedCount }} 项内容
          </span>
          <span v-else class="text-muted-foreground">投标资料库暂无可用资料，请上传资料或手动补充。</span>
          <span class="flex-1" />
          <RouterLink to="/tender-library" class="text-primary hover:underline">查看投标资料库</RouterLink>
          <button type="button" class="inline-flex items-center gap-1 rounded border border-primary/30 px-2 py-1 text-primary disabled:opacity-50" :disabled="saving" @click="refreshLibrary">
            <RefreshCw class="size-3.5" />重新匹配
          </button>
        </div>
        <p class="mt-1.5 text-muted-foreground">四个页签优先带入资料库中的已有内容；未匹配到的项目请手动补充，已修改的内容会保留。</p>
        <p v-if="libraryMatch?.pendingCount" class="mt-1 text-amber-700">{{ libraryMatch.pendingCount }} 份资料尚无可用识别文字；原件已匹配，相关字段可等待资料库识别完成后重新匹配或手动补充。</p>
        <details v-if="libraryMatch?.warnings.length" class="mt-2 text-amber-700">
          <summary class="cursor-pointer">{{ libraryMatch.warnings.length }} 项匹配结果需要核对</summary>
          <ul class="mt-1 list-inside list-disc space-y-1"><li v-for="warning in libraryMatch.warnings" :key="warning">{{ warning }}</li></ul>
        </details>
      </div>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          type="button"
          class="rounded-md border px-3 py-1.5 text-[12px] transition-colors"
          :class="activeTab === tab.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary/60'"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span v-if="libraryMatch?.groups[tab.key]" class="ml-1 opacity-75">· 已匹配 {{ libraryMatch.groups[tab.key] }}</span>
          <span
            v-if="tab.key === 'certificates' && blockingCount"
            class="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] text-white"
          >{{ blockingCount }}</span>
        </button>
        <span class="flex-1" />
        <span v-if="message" class="text-[12px] text-emerald-600">{{ message }}</span>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[12px] text-primary-foreground disabled:opacity-50"
          :disabled="saving"
          @click="save()"
        >
          <Save class="size-3.5" />{{ saving ? '保存中…' : '保存资料' }}
        </button>
      </div>
      <!-- 基本信息 -->
      <div v-show="activeTab === 'base'" class="space-y-4">
        <div class="grid grid-cols-1 gap-x-4 gap-y-2.5 md:grid-cols-2">
          <label v-for="field in COMPANY_FIELDS" :key="field.key" class="block text-[12px]" :class="field.wide ? 'md:col-span-2' : ''">
            <span class="mb-1 flex flex-wrap items-center gap-x-2 text-muted-foreground">
              {{ field.label }}
              <span v-if="fieldSource('company', field.key)" class="text-[10px] text-emerald-600" :title="fieldSource('company', field.key)">已从资料库匹配</span>
              <span v-else-if="!profile.company[field.key]" class="text-[10px] text-amber-600">待补充</span>
            </span>
            <textarea
              v-if="field.multiline"
              v-model="profile.company[field.key]"
              rows="3"
              placeholder="资料库未匹配到时，请手动补充"
              class="w-full rounded-md border border-border bg-background px-2.5 py-1.5 focus:border-primary focus:outline-none"
            />
            <input
              v-else
              v-model="profile.company[field.key]"
              :placeholder="field.placeholder || '资料库未匹配到时，请手动填写'"
              class="w-full rounded-md border border-border bg-background px-2.5 py-1.5 focus:border-primary focus:outline-none"
            >
          </label>
        </div>
        <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <fieldset
            v-for="person in [
              { key: 'legalRep', label: '法定代表人（单位负责人）', idNumber: true },
              { key: 'agent', label: '委托代理人（被授权人）', idNumber: true },
              { key: 'techLead', label: '技术负责人', idNumber: false },
            ]"
            :key="person.key"
            class="rounded-md border border-border p-3"
          >
            <legend class="px-1 text-[12px] font-medium">{{ person.label }}</legend>
            <label v-for="field in PERSON_FIELDS" :key="field.key" class="mb-2 block text-[12px]">
              <span class="mb-1 block text-muted-foreground">{{ field.label }}<span v-if="fieldSource(person.key, field.key)" class="ml-2 text-[10px] text-emerald-600" :title="fieldSource(person.key, field.key)">已从资料库匹配</span></span>
              <input
                v-model="(profile as any)[person.key][field.key]"
                placeholder="未匹配到时手动填写"
                class="w-full rounded-md border border-border bg-background px-2.5 py-1.5 focus:border-primary focus:outline-none"
              >
            </label>
            <label v-if="person.idNumber" class="block text-[12px]">
              <span class="mb-1 block text-muted-foreground">身份证号</span>
              <input
                v-model="(profile as any)[person.key].idNumber"
                placeholder="未匹配到时手动填写"
                class="w-full rounded-md border border-border bg-background px-2.5 py-1.5 focus:border-primary focus:outline-none"
              >
            </label>
          </fieldset>
        </div>
        <div>
          <h4 class="mb-2 text-[12px] font-medium">股东及出资情况</h4>
          <BidGenRowEditor v-model="profile.shareholders" :columns="SHAREHOLDER_COLUMNS" add-label="添加股东" />
        </div>
      </div>

      <!-- 人员与财务 -->
      <div v-show="activeTab === 'people'" class="space-y-4">
        <div>
          <h4 class="mb-2 text-[12px] font-medium">人员构成（用于“研发团队规模”“人力资源”评分）</h4>
          <div class="grid grid-cols-2 gap-x-4 gap-y-2.5 md:grid-cols-3">
            <label v-for="field in STAFF_FIELDS" :key="field.key" class="block text-[12px]">
              <span class="mb-1 block text-muted-foreground">{{ field.label }}<span v-if="fieldSource('staff', field.key)" class="ml-2 text-[10px] text-emerald-600" :title="fieldSource('staff', field.key)">已匹配</span></span>
              <input v-model="profile.staff[field.key]" placeholder="未匹配到时手动填写" class="w-full rounded-md border border-border bg-background px-2.5 py-1.5 focus:border-primary focus:outline-none">
            </label>
          </div>
        </div>
        <div>
          <h4 class="mb-2 text-[12px] font-medium">近三年财务信息（用于“经营状况”“科研经费占比”评分）</h4>
          <BidGenRowEditor v-model="profile.finance" :columns="FINANCE_COLUMNS" add-label="添加年度" />
        </div>
        <div>
          <h4 class="mb-2 text-[12px] font-medium">售后服务（用于“售后服务”评分）</h4>
          <div class="grid grid-cols-2 gap-x-4 gap-y-2.5 md:grid-cols-4">
            <label v-for="field in SERVICE_FIELDS" :key="field.key" class="block text-[12px]" :class="field.wide ? 'col-span-2 md:col-span-4' : ''">
              <span class="mb-1 block text-muted-foreground">{{ field.label }}<span v-if="fieldSource('service', field.key)" class="ml-2 text-[10px] text-emerald-600" :title="fieldSource('service', field.key)">已匹配</span></span>
              <input v-model="profile.service[field.key]" placeholder="未匹配到时手动填写" class="w-full rounded-md border border-border bg-background px-2.5 py-1.5 focus:border-primary focus:outline-none">
            </label>
          </div>
        </div>
        <div>
          <h4 class="mb-2 text-[12px] font-medium">制度与声明（未匹配项请核实后勾选，勾选后按“已具备”表述）</h4>
          <div class="grid grid-cols-1 gap-1.5 md:grid-cols-2 xl:grid-cols-3">
            <label v-for="item in DECLARATIONS" :key="item.key" class="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-[12px]">
              <input v-model="profile.declarations[item.key]" type="checkbox" class="size-3.5 accent-[var(--primary)]">
              {{ item.label }}
              <span v-if="fieldSource('declarations', item.key)" class="text-[10px] text-emerald-600">已匹配</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 生产能力与创新 -->
      <div v-show="activeTab === 'capability'" class="space-y-4">
        <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div>
            <h4 class="mb-2 text-[12px] font-medium">主要生产设备（按评分标准中的设备类别填写数量）</h4>
            <BidGenRowEditor v-model="profile.equipment" :columns="EQUIPMENT_COLUMNS" add-label="添加设备" />
          </div>
          <div>
            <h4 class="mb-2 text-[12px] font-medium">主要试验检测设备</h4>
            <BidGenRowEditor v-model="profile.testEquipment" :columns="TEST_EQUIPMENT_COLUMNS" add-label="添加试验设备" />
          </div>
        </div>
        <label class="block text-[12px]">
          <span class="mb-1 block text-muted-foreground">已应用的智能制造系统软件（用顿号分隔，如 MES生产管理系统、智能仓储系统）</span>
          <input v-model="systemsText" placeholder="资料库未匹配到时，请手动补充" class="w-full rounded-md border border-border bg-background px-2.5 py-1.5 focus:border-primary focus:outline-none">
        </label>
        <div>
          <h4 class="mb-2 text-[12px] font-medium">同类产品供货业绩（用于“供货业绩”评分）</h4>
          <BidGenRowEditor v-model="profile.performances" :columns="PERFORMANCE_COLUMNS" add-label="添加业绩" />
        </div>
        <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div>
            <h4 class="mb-2 text-[12px] font-medium">参与制定的标准</h4>
            <BidGenRowEditor v-model="profile.standards" :columns="STANDARD_COLUMNS" add-label="添加标准" />
          </div>
          <div>
            <h4 class="mb-2 text-[12px] font-medium">与所投产品相关的专利</h4>
            <BidGenRowEditor v-model="profile.patents" :columns="PATENT_COLUMNS" add-label="添加专利" />
          </div>
          <div>
            <h4 class="mb-2 text-[12px] font-medium">科技成果 / 奖励</h4>
            <BidGenRowEditor v-model="profile.awards" :columns="AWARD_COLUMNS" add-label="添加成果" />
          </div>
        </div>
      </div>

      <!-- 证件库 -->
      <div v-show="activeTab === 'certificates'" class="space-y-3">
        <div
          v-if="check"
          class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-[12px]"
          :class="check.passed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'"
        >
          <span class="inline-flex items-center gap-1 font-medium">
            <ShieldCheck v-if="check.passed" class="size-4" /><AlertTriangle v-else class="size-4" />
            {{ check.passed ? '证件效期校验通过' : '证件效期校验未通过' }}
          </span>
          <span>有效 {{ check.summary.valid }}</span>
          <span>即将到期 {{ check.summary.expiring }}</span>
          <span>不能覆盖投标有效期 {{ check.summary.insufficient }}</span>
          <span>已过期 {{ check.summary.expired }}</span>
          <span>未登记有效期 {{ check.summary.unknown }}</span>
          <span v-if="check.missing.length">缺少必备证件：{{ check.missing.map((item) => item.categoryLabel).join('、') }}</span>
          <span class="text-[11px] opacity-80">
            校验基准：今天{{ bidDeadline ? `、投标截止日 ${bidDeadline.slice(0, 10)}` : '' }}{{ validityEnd ? `、投标有效期届满日 ${validityEnd}` : '' }}
          </span>
        </div>
        <div class="overflow-x-auto rounded-md border border-border">
          <table class="w-full min-w-[980px] text-[12px]">
            <thead class="bg-muted/60 text-muted-foreground">
              <tr>
                <th class="w-[150px] px-2 py-1.5 text-left font-medium">证件类别</th>
                <th class="px-2 py-1.5 text-left font-medium">证件名称</th>
                <th class="w-[130px] px-2 py-1.5 text-left font-medium">证件编号</th>
                <th class="w-[128px] px-2 py-1.5 text-left font-medium">有效期至</th>
                <th class="w-[52px] px-2 py-1.5 font-medium">长期</th>
                <th class="w-[130px] px-2 py-1.5 text-left font-medium">扫描件</th>
                <th class="w-[230px] px-2 py-1.5 text-left font-medium">效期校验</th>
                <th class="w-9" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="certificate in profile.certificates" :key="certificate.id" class="border-t border-border align-top">
                <td class="px-1 py-1">
                  <select
                    v-model="certificate.category"
                    class="w-full rounded border border-border bg-background px-1 py-1"
                    @change="onCategoryChange(certificate)"
                  >
                    <option v-for="category in categories" :key="category.key" :value="category.key">
                      {{ category.label }}{{ category.required ? '（必备）' : '' }}
                    </option>
                  </select>
                </td>
                <td class="px-1 py-1"><input v-model="certificate.name" class="w-full rounded border border-border bg-background px-1.5 py-1"></td>
                <td class="px-1 py-1"><input v-model="certificate.number" class="w-full rounded border border-border bg-background px-1.5 py-1"></td>
                <td class="px-1 py-1">
                  <input v-model="certificate.validTo" type="date" :disabled="certificate.perpetual" class="w-full rounded border border-border bg-background px-1 py-1 disabled:opacity-40">
                </td>
                <td class="px-1 py-2 text-center"><input v-model="certificate.perpetual" type="checkbox" class="size-3.5 accent-[var(--primary)]"></td>
                <td class="px-1 py-1">
                  <label class="inline-flex cursor-pointer items-center gap-1 rounded border border-dashed border-border px-1.5 py-1 hover:border-primary hover:text-primary">
                    <FileImage v-if="certificate.storedFile" class="size-3.5 text-emerald-600" /><Upload v-else class="size-3.5" />
                    <span class="max-w-[84px] truncate">{{ uploadingId === certificate.id ? '上传中…' : certificate.fileName || '上传扫描件' }}</span>
                    <input type="file" accept=".png,.jpg,.jpeg,.bmp,.gif,.pdf" class="hidden" @change="onScanSelected(certificate, $event)">
                  </label>
                  <p v-if="certificate.libraryDocumentId" class="mt-1 text-[10px] text-emerald-600" :title="certificate.librarySource">来自投标资料库</p>
                </td>
                <td class="px-1 py-1">
                  <template v-if="checkById.get(certificate.id)">
                    <span class="inline-block rounded border px-1.5 py-0.5" :class="STATUS_STYLE[checkById.get(certificate.id)!.status]">
                      {{ checkById.get(certificate.id)!.statusLabel }}
                    </span>
                    <p class="mt-0.5 text-[11px] leading-snug text-muted-foreground">{{ checkById.get(certificate.id)!.message }}</p>
                  </template>
                  <span v-else class="text-[11px] text-muted-foreground">保存后校验</span>
                </td>
                <td class="py-1 text-center">
                  <button type="button" class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="删除证件" @click="removeCertificate(certificate.id)">
                    <Trash2 class="size-3.5" />
                  </button>
                </td>
              </tr>
              <tr v-if="!profile.certificates.length"><td colspan="8" class="px-3 py-5 text-center text-muted-foreground">投标资料库未匹配到证件，请添加证件并上传扫描件。</td></tr>
            </tbody>
          </table>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <button type="button" class="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1 text-[12px] text-muted-foreground hover:border-primary hover:text-primary" @click="addCertificate">
            <Plus class="size-3.5" />添加证件
          </button>
          <button type="button" class="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] hover:border-primary hover:text-primary" :disabled="saving" @click="save()">
            <CheckCircle2 class="size-3.5" />保存并重新校验
          </button>
          <span class="text-[11px] text-muted-foreground">
            过期证件不会计入评分自查的得分支撑；上传的图片扫描件会自动贴入标书对应章节，未上传的章节保留虚线粘贴框。
          </span>
        </div>
      </div>
    </template>
  </div>
</template>
