import { apiDownload, apiFetchBlob, apiRequest } from '@/lib/api'
import { getAccessToken } from '@/lib/auth'
import type { BidBrief } from '@/lib/tenders-api'

const base = '/api/v1/tenders/workbench'

export type WorkbenchProjectSummary = {
  id: string
  name: string
  status: 'ready' | 'warning' | 'blocked'
  updatedAt: string
}

export type WorkbenchFields = Pick<BidBrief, 'projectName' | 'tenderer' | 'bidderName' | 'tenderNo' | 'bidderCompanyId' | 'legalPersonKey'>
type SavedFile = { id: string; name: string }

export type WorkbenchProject = {
  id: string
  revision: number
  updatedAt: string
  sources: SavedFile[]
  brief: BidBrief | null
  inputIssue: string
  notes: string[]
  attachments: Record<string, SavedFile>
  allowedSlots: { key: string; title: string; required: boolean; inLibrary: boolean }[]
  legalPersons: { key: string; name: string }[]
  quote: SavedFile | null
  quoteNotes?: string[]
  format: { source: string; message: string } | null
  output: { name: string; warnings: string[]; stale: boolean } | null
  lastChapterId: string
}

function request<T>(url: string, method = 'GET', body?: unknown) {
  return apiRequest<T>(url, { method, body, token: getAccessToken() })
}

function sourceForm(files: File[], revision?: number) {
  const data = new FormData()
  for (const file of files) data.append('files', file)
  if (revision !== undefined) data.append('revision', String(revision))
  return data
}

export function listWorkbenchProjects() {
  return request<WorkbenchProjectSummary[]>(base)
}

export function createWorkbenchProject(files: File[]) {
  return request<WorkbenchProject>(base, 'POST', sourceForm(files))
}

export function workbenchProject(id: string) {
  const root = `${base}/${encodeURIComponent(id)}`
  function mutate(action: string, method: string, body: unknown) {
    return request<WorkbenchProject>(root + action, method, body)
  }
  function withFile(action: string, revision: number, file: File) {
    const data = new FormData()
    data.append('revision', String(revision))
    data.append('file', file)
    return mutate(action, 'PUT', data)
  }
  return {
    get: () => request<WorkbenchProject>(root),
    identify: (revision: number) => mutate('/identify', 'POST', { revision }),
    replaceSources: (revision: number, files: File[]) => mutate('/sources', 'PUT', sourceForm(files, revision)),
    fields: (revision: number, fields: WorkbenchFields) => mutate('/fields', 'PATCH', { revision, ...fields }),
    quote: (revision: number, file: File) => withFile('/quote', revision, file),
    attach: (revision: number, key: string, file: File) =>
      withFile(`/attachments/${encodeURIComponent(key)}`, revision, file),
    chapter: (revision: number, key: string, text: string) =>
      mutate(`/chapters/${encodeURIComponent(key)}`, 'PUT', { revision, text }),
    suggest: (revision: number, key: string) =>
      request<{ text: string; notes: string[]; revision: number }>(
        `${root}/chapters/${encodeURIComponent(key)}/suggestion`, 'POST', { revision },
      ),
    format: (revision: number) => mutate('/format', 'POST', { revision }),
    confirmFormat: (revision: number) => mutate('/format/confirm', 'POST', { revision }),
    generate: (revision: number) => mutate('/generate', 'POST', { revision }),
    download: (kind: 'format' | 'output', name: string) =>
      apiDownload(`${root}/files/${kind}`, { token: getAccessToken(), fallbackName: name }),
    file: (kind: 'format' | 'output') => apiFetchBlob(`${root}/files/${kind}`, { token: getAccessToken() }),
  }
}
