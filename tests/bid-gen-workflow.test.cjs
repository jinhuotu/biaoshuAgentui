const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const root = path.resolve(__dirname, '..')
const ts = require(root + '/node_modules/typescript')
const vue = require(root + '/node_modules/vue')
const sfc = require(root + '/node_modules/@vue/compiler-sfc')

function loadModule(source, filename, mocks = {}) {
  const loaded = new Module(filename)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(root + '/src')
  const original = loaded.require.bind(loaded)
  loaded.require = name => name in mocks ? mocks[name] : original(name)
  loaded._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, filename)
  return loaded.exports
}

function setupView(name, mocks) {
  const filename = root + '/src/' + name
  const parsed = sfc.parse(fs.readFileSync(filename, 'utf8')).descriptor
  const compiled = sfc.compileScript(parsed, { id: 'workflow-test' })
  assert.deepEqual(sfc.compileTemplate({ source: parsed.template.content, filename, id: 'workflow-test' }).errors, [])
  const component = loadModule(compiled.content, filename, {
    vue: { ...vue, onMounted() {} },
    'vue-router': { useRoute: () => ({ path: '/tenders', query: {} }), useRouter: () => ({ replace: async () => {} }) },
    '@/components/ui-kit': {},
    '@/components/bid-gen/BidGenCorpusPanel.vue': {},
    '@/components/bid-gen/BidGenProfilePanel.vue': {},
    '@/components/bid-gen/BidGenResultPanel.vue': {},
    '@/components/bid-gen/BidGenTenderPanel.vue': {},
    '@/components/tenders/TenderQaPanel.vue': {},
    '@/components/tenders/TenderStatusTag.vue': {},
    '@/lib/bid-gen-upload': {},
    '@/lib/tender-tasks': {},
    ...mocks,
  }).default
  return component.setup({}, { expose() {} })
}

const task = {
  id: 'new-task', recordId: 'record-one', workflowStatus: 'processing', workflowLocked: false,
  versionConfirmed: false, selection: { lotCodes: [], packageNo: '包1', signDate: '' },
  tender: { lots: [] }, result: { generatedAt: '2026-11-17T10:00:00' },
}

test('new generation requires version confirmation and locks after manual submission', async () => {
  const calls = []
  const api = setupView('views/BidGenView.vue', {
    '@/lib/bid-gen-api': {
      listBidTasks: async () => [], generateBid: async () => structuredClone(task),
      confirmBidVersion: async id => calls.push(['confirm', id]),
    },
    '@/lib/tenders-api': {
      submitTenderRecord: async id => { calls.push(['submit', id]); return { status: 'pending', workflowLocked: true } },
    },
  })
  api.task.value = { ...structuredClone(task), result: null }
  await api.generate()
  assert.equal(api.stepIndex.value, 3)
  assert.equal(api.task.value.recordId, 'record-one')
  assert.deepEqual(calls, [])
  await api.submitApproval()
  assert.deepEqual(calls, [])
  await api.confirmVersion()
  assert.equal(api.task.value.versionConfirmed, true)
  await api.submitApproval()
  assert.deepEqual(calls, [['confirm', 'new-task'], ['submit', 'record-one']])
  assert.equal(api.task.value.workflowLocked, true)
  await api.generate()
  assert.equal(api.task.value.workflowStatus, 'pending')
})

test('editing routes preserve old records and open the corresponding new task', () => {
  const filename = root + '/src/lib/tender-tasks.ts'
  const helper = loadModule(fs.readFileSync(filename, 'utf8'), filename, {
    '@/stores/auth': {}, '@/lib/tenders-api': {}, '@/lib/time': {},
  })
  assert.deepEqual(helper.taskEditLocation({ recordId: 'legacy' }), {
    path: '/tenders-classic', query: { record: 'legacy' },
  })
  const record = helper.recordToTask({ id: 'record', source: 'bidgen', sourceTaskId: 'task', status: 'processing' })
  assert.deepEqual(helper.taskEditLocation(record), { path: '/tenders', query: { id: 'task' } })
})

test('scoring page loads snapshot risks and keeps final Word scoring separate', async () => {
  const row = { id: 'record-one', source: 'bidgen', sourceTaskId: 'new-task', docxAvailable: true, docxFile: 'abc.docx' }
  const snapshot = { ...task, result: { ...task.result, riskCheck: [{ level: '高', item: '报价', detail: '待核对' }],
    analysis: { basics: [{ label: '项目编号', value: 'TEST-17' }] } } }
  const calls = []
  const api = setupView('views/TenderQaView.vue', {
    '@/stores/auth': { useAuthStore: () => ({ isAdmin: true }) },
    '@/lib/time': {}, '@/lib/api': { ApiError: Error },
    '@/lib/bid-gen-api': { fetchBidRecordReview: async id => { calls.push(['snapshot', id]); return snapshot } },
    '@/lib/tenders-api': {
      fetchTenderRecords: async () => ({ items: [row], total: 1 }),
      fetchTenderRecord: async () => row,
      fetchTenderQa: async () => ({ report: null }),
      inspectTenderQa: async (id, options) => { calls.push(['score', id, options.volume]); return { score: 70 } },
      inspectTenderQaUpload: async (id, file, options) => {
        calls.push(['final', id, file.name, options.volume]); return { score: 85, source: 'upload' }
      },
    },
  })
  await api.loadList()
  await api.selectRecord('record-one')
  await vue.nextTick()
  await api.loadSaved('record-one')
  assert.equal(api.bidReview.value.result.riskCheck[0].item, '报价')
  assert.equal(api.bidReview.value.result.analysis.basics[0].value, 'TEST-17')
  await api.runGenerated()
  assert.equal(api.qaReport.value.score, 70)
  api.pickFile.value = new File(['Word'], '终稿.docx')
  await api.runUpload()
  assert.equal(api.qaReport.value.score, 85)
  assert.equal(api.bidReview.value.result.riskCheck[0].detail, '待核对')
  assert.ok(calls.some(c => c.join('|') === 'final|record-one|终稿.docx|business'))
})

test('late snapshot response cannot overwrite the newly selected task', async () => {
  let finish
  const api = setupView('views/TenderQaView.vue', {
    '@/stores/auth': { useAuthStore: () => ({ isAdmin: true }) },
    '@/lib/time': {}, '@/lib/api': { ApiError: Error },
    '@/lib/bid-gen-api': { fetchBidRecordReview: () => new Promise(resolve => { finish = resolve }) },
    '@/lib/tenders-api': { fetchTenderQa: async () => ({ report: null }) },
    vue: { ...vue, onMounted() {}, watch() {} },
  })
  api.items.value = [{ id: 'old', source: 'bidgen' }]
  api.selectedId.value = 'old'
  const loading = api.loadSaved('old')
  api.selectedId.value = 'new'
  finish({ id: 'old', result: { riskCheck: [{ item: 'old risk' }] } })
  await loading
  assert.equal(api.bidReview.value, null)
})

test('file APIs use registered snapshots for review and original task files otherwise', async () => {
  const calls = []
  let confirmation
  const filename = root + '/src/lib/bid-gen-api.ts'
  const api = loadModule(fs.readFileSync(filename, 'utf8'), filename, {
    './api': { apiDownload: async url => calls.push(url), apiRequest: async (url, options) => {
      calls.push(url)
      if (url.endsWith('/confirm')) confirmation = options.body
    }, getApiBaseUrl: () => '' },
    './auth': { getAccessToken: () => 'token' },
  })
  await api.downloadBidFile('task', '商务.docx', 'record')
  await api.downloadBidFile('task', '技术.docx')
  await api.fetchBidRecordReview('record')
  assert.deepEqual(calls, [
    '/api/v1/bid-gen/records/record/files/' + encodeURIComponent('商务.docx'),
    '/api/v1/bid-gen/tasks/task/files/' + encodeURIComponent('技术.docx'),
    '/api/v1/bid-gen/records/record/review',
  ])
  await api.confirmBidVersion('task', '2026-11-17T10:00:00', 'current-digest')
  assert.deepEqual(confirmation, { generatedAt: '2026-11-17T10:00:00', contentDigest: 'current-digest' })
})
