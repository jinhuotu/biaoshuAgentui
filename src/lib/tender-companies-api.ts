import { apiRequest } from '@/lib/api'
import { getAccessToken } from '@/lib/auth'
import type { SlotStatus } from '@/lib/tenders-api'

const root = '/api/v1/tenders/materials/companies'

export type CompanyInput = {
  name: string
  creditCode: string
  aliases: string[]
  active: boolean
}

export type TenderCompany = CompanyInput & {
  id: string
  baseId: string
  canManage: boolean
  canUse: boolean
}

export type CompanyDirectory = {
  items: TenderCompany[]
  canCreate: boolean
  legacyAvailable: boolean
}

export type CompanyOriginal = { baseId?: string }

export function isCompanyLibrary(baseId: string) {
  return /^tenderco-/i.test(baseId)
}

export function companyLibraryFilePath(baseId: string, docId: string, withToken = false) {
  const query = new URLSearchParams({ baseId })
  const token = withToken ? getAccessToken() : null
  if (token) query.set('access_token', token)
  return `/api/v1/knowledge/documents/${encodeURIComponent(docId)}/file?${query}`
}

export function listTenderCompanies() {
  return apiRequest<CompanyDirectory>(root, { token: getAccessToken() })
}

export function saveTenderCompany(body: CompanyInput, id?: string) {
  return apiRequest<TenderCompany>(id ? `${root}/${encodeURIComponent(id)}` : root, {
    method: id ? 'PUT' : 'POST', body, token: getAccessToken(),
  })
}

export function companyLibrary(companyId: string) {
  const path = `${root}/${encodeURIComponent(companyId)}/library`
  const itemPath = (key: string) => `/items/${encodeURIComponent(key)}`
  const filePath = (id: string) => `/files/${encodeURIComponent(id)}`
  function request<T>(suffix: string, method = 'GET', body?: unknown) {
    return apiRequest<T>(path + suffix, { method, body, token: getAccessToken() })
  }
  return {
    list: () => request<{ slots: SlotStatus[]; hint: string; baseId: string }>(''),
    create: (body: { title: string; hint: string; key?: string }) =>
      request('/items', 'POST', body),
    rename: (key: string, body: { title: string; hint: string }) =>
      request(itemPath(key), 'PATCH', body),
    deleteItem: (key: string) => request(itemPath(key), 'DELETE'),
    clearFiles: (key: string) => request(itemPath(key) + '/files', 'DELETE'),
    deleteFile: (id: string) => request(filePath(id), 'DELETE'),
    saveFacts: (id: string, body: { role: string; fields: { name: string; value: string }[] }) =>
      request(filePath(id) + '/facts', 'PATCH', body),
    reindex: (force: boolean) =>
      request<{ queued: number; skipped: number }>(`/reindex?force=${force}`, 'POST'),
    upload: (key: string, files: File[], replace: boolean) => {
      const body = new FormData()
      for (const file of files) body.append('files', file)
      body.set('replace', String(replace))
      return request(itemPath(key) + '/files', 'POST', body)
    },
  }
}
