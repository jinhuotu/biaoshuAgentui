const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const root = path.resolve(__dirname, '..')
const ts = require(root + '/node_modules/typescript')
const vue = require(root + '/node_modules/vue')
const sfc = require(root + '/node_modules/@vue/compiler-sfc')

const filename = root + '/src/views/TenderLibraryView.vue'
const descriptor = sfc.parse(fs.readFileSync(filename, 'utf8'), { filename }).descriptor
const compiled = sfc.compileScript(descriptor, { id: 'tender-library-overwrite-test' }).content
const noop = async () => ({})
const mocks = {
  vue: { ...vue, onMounted: () => {} },
  'vue-router': { useRouter: () => ({ push() {} }) },
  'lucide-vue-next': {},
  '@/components/ui-kit': {},
  '@/components/ui/AppAlertDialog.vue': {},
  '@/components/tenders/TenderScanGallery.vue': {},
  '@/components/tenders/MaterialArchivePanel.vue': {},
  '@/lib/api': { ApiError: class ApiError extends Error {} },
  '@/lib/auth': { getAccessToken: () => 'test-token' },
  '@/lib/tenders-api': {
    clearTenderSlot: noop,
    createTenderLibraryItem: noop,
    deleteTenderLibraryFile: noop,
    deleteTenderLibraryItem: noop,
    dismissTenderLibraryItem: noop,
    fetchTenderLibrary: noop,
    resolveLibraryFileId: () => '',
    reindexTenderLibrary: noop,
    updateLibraryFileFacts: noop,
    updateTenderLibraryItem: noop,
    uploadTenderSlot: noop,
  },
}

const instance = new Module(filename)
instance.filename = filename
instance.paths = Module._nodeModulePaths(root + '/src')
const originalRequire = instance.require.bind(instance)
instance.require = name => name in mocks ? mocks[name] : originalRequire(name)
instance._compile(
  ts.transpileModule(compiled, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText,
  filename,
)

const api = instance.exports.default.setup({}, { expose() {} })
let opened = false
api.fileInput.value = { click: () => { opened = true } }
const occupied = { key: 'business_license', title: '营业执照', hint: '', fileCount: 1, files: [] }

api.pickFiles(occupied, true)
assert.equal(api.pendingReplaceSlot.value.key, occupied.key)
assert.equal(api.pendingReplaceSlot.value.fileCount, occupied.fileCount)
assert.equal(opened, false)

api.confirmReplaceUpload()
assert.equal(api.pendingReplaceSlot.value, null)
assert.equal(opened, true)

console.log('Passed: replacing an occupied tender-library slot requires confirmation before opening the file picker')
