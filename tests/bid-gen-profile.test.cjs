const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const root = path.resolve(__dirname, '..')
const ts = require(root + '/node_modules/typescript')
const vue = require(root + '/node_modules/vue')
const sfc = require(root + '/node_modules/@vue/compiler-sfc')

const profile = {
  company: { name: '资料库企业', contact: '' }, legalRep: {}, agent: {}, techLead: {}, staff: {}, service: {}, declarations: {},
  shareholders: [], finance: [], equipment: [], testEquipment: [], performances: [], patents: [], standards: [], awards: [], systems: [], certificates: [],
}
let loads = 0
let fail = false
let saved
const mocks = {
  vue: { ...vue, onMounted: () => {} },
  './BidGenRowEditor.vue': {},
  '@/lib/bid-gen-api': {
    fetchCompanyProfile: async () => {
      loads += 1
      if (fail) throw new Error('资料库读取失败')
      return {
        profile: structuredClone(saved || profile), certificateCategories: [],
        libraryMatch: { documentCount: 1, matchedCount: 1, pendingCount: 0, groups: { base: 1, people: 0, capability: 0, certificates: 0 },
          sources: { 'company.name': [{ documentId: 'license1', name: '营业执照', title: '营业执照' }] }, warnings: [] },
      }
    },
    saveCompanyProfile: async value => { saved = JSON.parse(JSON.stringify(value)); return { profile: structuredClone(saved) } },
    checkCertificates: async () => ({ items: [], summary: { expired: 0 }, missing: [], passed: true }),
  },
}
const filename = root + '/src/components/bid-gen/BidGenProfilePanel.vue'
const descriptor = sfc.parse(fs.readFileSync(filename, 'utf8')).descriptor
const compiled = sfc.compileScript(descriptor, { id: 'profile-test' }).content
const moduleInstance = new Module(filename)
moduleInstance.filename = filename
moduleInstance.paths = Module._nodeModulePaths(root + '/src')
const originalRequire = moduleInstance.require.bind(moduleInstance)
moduleInstance.require = name => name in mocks ? mocks[name] : originalRequire(name)
moduleInstance._compile(ts.transpileModule(compiled, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename)

;(async () => {
  const api = moduleInstance.exports.default.setup({ taskId: 'task1', bidDeadline: '', validityEnd: '' }, { expose() {}, emit() {} })
  await api.load()
  assert.equal(loads, 1)
  assert.equal(api.profile.value.company.name, '资料库企业')
  assert.equal(api.libraryMatch.value.groups.base, 1)
  assert.match(api.fieldSource('company', 'name'), /营业执照/)
  assert.equal(api.fieldSource('company', 'contact'), '')
  api.profile.value.company.contact = '人工补充联系人'
  await api.refreshLibrary()
  assert.equal(loads, 2)
  assert.equal(saved.company.contact, '人工补充联系人')
  assert.equal(api.profile.value.company.contact, '人工补充联系人')
  fail = true
  await api.load()
  assert.equal(api.loading.value, false)
  assert.match(api.errorMessage.value, /资料库读取失败/)
  assert.equal(api.profile.value.company.contact, '人工补充联系人')
  const template = sfc.compileTemplate({ source: descriptor.template.content, filename, id: 'profile-test' })
  assert.deepEqual(template.errors, [])
  console.log('Passed: profile auto-load, source hints, refresh preserves manual edits, failure retains form, template compiles')
})().catch(error => { console.error(error); process.exitCode = 1 })
