import { apiDownload, apiRequest, getApiBaseUrl } from './api'
import { getAccessToken } from './auth'

const BASE = '/api/v1/bid-gen'

export type TreeEntry = {
  name: string
  logical_path: string
  depth: number
  suffix: string
  size: number
  children: TreeEntry[]
}

export type TenderFile = {
  name: string
  logicalPath: string
  chain: string[]
  depth: number
  suffix: string
  size: number
  role: string
  roleLabel: string
  note: string
}

export type TenderLot = {
  category: string
  lotCode: string
  lotName: string
  unit: string
  quantity: string
  packageRange: string
  weights: string[]
  performanceRequirement: string
  awardRule: string
}

export type TenderCriterion = {
  criterionId: string
  volume: 'business' | 'technical'
  category: string
  group: string
  factor: string
  minScore: number | null
  maxScore: number | null
  rule: string
}

export type FormatItem = {
  volume: string
  number: string
  title: string
  level: number
  required: boolean
  hasFormat: boolean
  notApplicable: boolean
  port: string
}

export type TechSpec = {
  fixedId: string
  fileName: string
  model: string
  conductor: string
  coreSection: string
  voltage: string
  parameterCount: number
}

export type TenderInfo = {
  projectName: string
  tenderNo: string
  packageNo: string
  purchasers: string[]
  agency: string
  bidDeadline: string
  validityDays: number
  validityEnd: string
  publishDate: string
  bidBondRequired: boolean
  consortiumAllowed: boolean
  lots: TenderLot[]
  criteria: TenderCriterion[]
  formatItems: FormatItem[]
  techSpecs: TechSpec[]
  files: TenderFile[]
  warnings: string[]
  qualificationCount: number
  clauseCount: number
}

export type OutlineNode = {
  key: string
  title: string
  heading: string
  level: number
  source: string
  notApplicable: boolean
  criteria: string[]
  charCount: number | null
  pendingCount: number
  placeholderCount: number
  children: OutlineNode[]
}

export type ScoreStatus = 'full' | 'partial' | 'missing' | 'manual' | 'external'

export type ScoreCheckItem = {
  criterionId: string
  volume: 'business' | 'technical'
  category: string
  group: string
  factor: string
  minScore: number | null
  maxScore: number | null
  rule: string
  deduction: boolean
  status: ScoreStatus
  statusLabel: string
  estimatedScore: number | null
  basis: string
  sections: { key: string; heading: string }[]
  pendingCount: number
  placeholderCount: number
  advice: string[]
}

export type ScoreCheckVolume = {
  volume: string
  label: string
  total: number
  counts: Record<ScoreStatus, number>
  maxScore: number
  estimatedScore: number
  unestimated: number
  externalMaxScore: number
}

export type ScoreCheck = {
  checkedAt: string
  items: ScoreCheckItem[]
  volumes: ScoreCheckVolume[]
  coverage: number
  expiredCertificates: string[]
  readBack: boolean
  passed: boolean
}

export type CertificateStatus = 'valid' | 'expiring' | 'expired' | 'insufficient' | 'unknown'

export type CertificateCheckItem = {
  id: string
  category: string
  categoryLabel: string
  name: string
  required: boolean
  validTo: string
  perpetual: boolean
  hasFile: boolean
  status: CertificateStatus
  statusLabel: string
  message: string
  daysLeft: number | null
}

export type CertificateCheck = {
  checkedAt: string
  bidDeadline: string
  validityEnd: string
  items: CertificateCheckItem[]
  missing: { category: string; categoryLabel: string }[]
  summary: Record<CertificateStatus, number>
  passed: boolean
}

export type ReviewItem = {
  section: string
  spec: string
  fixedId: string
  number: string
  name: string
  required: string
  value: string
  basis: string
  basisLabel: string
}

export type OutputFile = {
  key: string
  label: string
  name: string
  size: number
  estimatedPages: number | null
}

export type GenerateResult = {
  generatedAt: string
  files: OutputFile[]
  outline: OutlineNode[]
  scoreCheck: ScoreCheck
  certificateCheck: CertificateCheck
  pending: { section: string; hint: string }[]
  reviewItems: ReviewItem[]
  /** 废标风险自查（高 / 中 / 低） */
  riskCheck?: { level: '高' | '中' | '低'; item: string; detail: string; suggestion: string }[]
  /** 招标文件分析 */
  analysis?: {
    basics: { label: string; value: string }[]
    qualifications: string[]
    scoreGroups: { group: string; maxScore: number }[]
    vetoClauses: string[]
    materials: { item: string; attachments: string[] }[]
  }
  coverage?: { factor: string; aspects: string[]; added: string[] }[]
  stats: {
    estimatedPages: number
    charCount: number
    sectionCount: number
    maxDepth: number
    tableCount: number
    placeholderCount: number
    pendingCount: number
    reviewCount: number
    pendingValueCount: number
  }
}

export type BidTask = {
  id: string
  archiveName: string
  status: 'parsed' | 'generated'
  createdAt: string
  updatedAt: string
  tree: TreeEntry[]
  selection: { lotCodes: string[]; packageNo: string; signDate: string }
  tender: TenderInfo
  result: GenerateResult | null
}

export type BidTaskSummary = {
  id: string
  archiveName: string
  projectName: string
  tenderNo: string
  status: 'parsed' | 'generated'
  createdAt: string
  updatedAt: string
  estimatedPages: number | null
}

export type Certificate = {
  id: string
  category: string
  name: string
  number: string
  issuer: string
  validFrom: string
  validTo: string
  perpetual: boolean
  fileName: string
  storedFile: string
  libraryDocumentId?: string
  librarySource?: string
}

export type NamedRow = Record<string, string>

export type CompanyProfile = {
  company: Record<string, string>
  legalRep: Record<string, string>
  techLead: Record<string, string>
  agent: Record<string, string>
  staff: Record<string, string>
  service: Record<string, string>
  declarations: Record<string, boolean>
  shareholders: NamedRow[]
  finance: NamedRow[]
  equipment: NamedRow[]
  testEquipment: NamedRow[]
  performances: NamedRow[]
  patents: NamedRow[]
  standards: NamedRow[]
  awards: NamedRow[]
  systems: string[]
  certificates: Certificate[]
}

export type CertificateCategory = { key: string; label: string; required: boolean }

export type LibraryMatch = {
  documentCount: number
  matchedCount: number
  pendingCount: number
  groups: Record<'base' | 'people' | 'capability' | 'certificates', number>
  sources: Record<string, { documentId: string; name: string; title: string }[]>
  warnings: string[]
  /** 资料库识别值与当前资料不同的字段；owner 非空表示该资料的企业主体与投标人不一致 */
  suggestions?: Record<string, LibrarySuggestion[]>
}

export type LibrarySuggestion = { value: string; documentId: string; name: string; title: string; owner: string }

function request<T>(path: string, method = 'GET', body?: unknown) {
  return apiRequest<T>(BASE + path, { method, body, token: getAccessToken() })
}

export const listBidTasks = () => request<BidTaskSummary[]>('/tasks')

export const fetchBidTask = (id: string) => request<BidTask>(`/tasks/${id}`)

export const deleteBidTask = (id: string) => request<{ id: string }>(`/tasks/${id}`, 'DELETE')

export type CorpusSummary = {
  sources: { id: string; name: string; sectionCount: number; importedAt: string }[]
  sectionCount: number
}

export const fetchCorpus = () => request<CorpusSummary>('/corpus')

export function importCorpusFile(file: File) {
  const form = new FormData()
  form.append('file', file)
  return request<CorpusSummary>('/corpus', 'POST', form)
}

export const deleteCorpusSource = (id: string) => request<CorpusSummary>(`/corpus/${id}`, 'DELETE')

export function uploadTenderArchive(file: File) {
  const form = new FormData()
  form.append('file', file)
  return request<BidTask>('/tasks', 'POST', form)
}

export function generateBid(
  id: string,
  selection: { lotCodes: string[]; packageNo: string; signDate: string; includeScoreIndex: boolean },
) {
  return request<BidTask>(`/tasks/${id}/generate`, 'POST', selection)
}

export function downloadBidFile(taskId: string, fileName: string) {
  return apiDownload(`${BASE}/tasks/${taskId}/files/${encodeURIComponent(fileName)}`, {
    token: getAccessToken(),
    fallbackName: fileName,
  })
}

/** 预览用：拿到 Word 文件的二进制，交给 docx-preview 渲染 */
export async function fetchBidFileBlob(taskId: string, fileName: string): Promise<Blob> {
  const token = getAccessToken()
  const response = await fetch(
    `${getApiBaseUrl()}${BASE}/tasks/${taskId}/files/${encodeURIComponent(fileName)}`,
    { headers: token ? { Authorization: `Bearer ${token}`, 'X-Access-Token': token } : {} },
  )
  if (!response.ok) throw new Error('文件读取失败，请重新生成后再试')
  return response.blob()
}

export const fetchCompanyProfile = () =>
  request<{ profile: CompanyProfile; certificateCategories: CertificateCategory[]; libraryMatch: LibraryMatch }>('/profile')

export const saveCompanyProfile = (profile: CompanyProfile) =>
  request<{ profile: CompanyProfile }>('/profile', 'PUT', profile)

export function uploadCertificateFile(certificateId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  return request<{ profile: CompanyProfile; recognized: Partial<Certificate> | null }>(
    `/profile/certificates/${certificateId}/file`,
    'POST',
    form,
  )
}

export const checkCertificates = (taskId = '') =>
  request<CertificateCheck>('/profile/certificate-check', 'POST', { taskId })
