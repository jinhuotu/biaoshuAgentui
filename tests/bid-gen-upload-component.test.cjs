const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const root = path.resolve(__dirname, '..')
const ts = require(root + '/node_modules/typescript')
const vue = require(root + '/node_modules/vue')
const sfc = require(root + '/node_modules/@vue/compiler-sfc')
const JSZip = require(root + '/node_modules/jszip')

function moduleFrom(source, filename, mocks = {}) {
  const loaded = new Module(filename)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(root + '/src')
  const original = loaded.require.bind(loaded)
  loaded.require = name => name in mocks ? mocks[name] : original(name)
  loaded._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename)
  return loaded.exports
}

const helperName = root + '/src/lib/bid-gen-upload.ts'
const helper = moduleFrom(fs.readFileSync(helperName, 'utf8'), helperName)
const filename = root + '/src/views/BidGenView.vue'
const descriptor = sfc.parse(fs.readFileSync(filename, 'utf8')).descriptor
const compiled = sfc.compileScript(descriptor, { id: 'bid-upload-test' }).content
const uploads = []
const component = moduleFrom(compiled, filename, {
  vue: { ...vue, onMounted() {} },
  'vue-router': { useRoute: () => ({ path: '/tenders', query: {} }), useRouter: () => ({ replace: async () => {} }) },
  '@/components/ui-kit': {},
  '@/components/bid-gen/BidGenProfilePanel.vue': {},
  '@/components/bid-gen/BidGenResultPanel.vue': {},
  '@/components/bid-gen/BidGenTenderPanel.vue': {},
  '@/lib/bid-gen-upload': helper,
  '@/lib/bid-gen-api': {
    listBidTasks: async () => [],
    uploadTenderArchive: async file => {
      uploads.push(file)
      return { id: 'test-task', selection: { lotCodes: [], packageNo: '', signDate: '' }, tender: { lots: [] } }
    },
  },
}).default

;(async () => {
  const api = component.setup({}, { expose() {} })
  const folder = { name: 'word', isDirectory: true, isFile: false, createReader: () => {
    let read = false
    return { readEntries(resolve) {
      if (read) return resolve([])
      read = true
      resolve([{ name: '招标.zip', isFile: true, isDirectory: false, file: resolve => resolve(new File(['zip bytes'], '招标.zip')) }])
    } }
  } }
  await api.onDrop({ dataTransfer: { files: [new File([], 'word')], items: [{ kind: 'file', webkitGetAsEntry: () => folder }] } })
  assert.equal(uploads.length, 1)
  assert.equal(uploads[0].name, 'word.zip')
  assert.ok((await JSZip.loadAsync(await uploads[0].arrayBuffer())).file('word/招标.zip'))
  assert.equal(api.errorMessage.value, '')
  assert.equal(api.stepIndex.value, 1)
  assert.equal(api.busy.value, '')
  const input = { value: 'selected', files: [new File(['a'], 'a.docx'), new File(['b'], 'b.zip')] }
  await api.onFileSelected({ target: input })
  assert.equal(input.value, '')
  assert.equal(uploads.length, 2)
  assert.equal(Object.keys((await JSZip.loadAsync(await uploads[1].arrayBuffer())).files).length, 2)
  await api.onDrop({ dataTransfer: { items: [], files: [new File(['x'], 'unsupported.rar')] } })
  assert.equal(uploads.length, 2)
  assert.match(api.errorMessage.value, /unsupported.rar/)
  assert.equal(api.busy.value, '')
  api.busy.value = 'upload'
  await api.onFileSelected({ target: { value: '', files: [new File(['x'], 'another.zip')] } })
  assert.equal(uploads.length, 2)
  console.log('Passed: real drop handler reads folders, preserves files, advances parsing step, supports multi-select, rejects unsupported types, prevents concurrent uploads')
})().catch(error => { console.error(error); process.exitCode = 1 })
