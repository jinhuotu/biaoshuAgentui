const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const root = path.resolve(__dirname, '..')
const ts = require(root + '/node_modules/typescript')
const vue = require(root + '/node_modules/vue')
const sfc = require(root + '/node_modules/@vue/compiler-sfc')
const pending = []
const mocks = {
  vue,
  '@/lib/bid-gen-api': { fetchLibraryExpiry: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) },
}
const filename = root + '/src/components/bid-gen/BidGenExpiryPanel.vue'
const descriptor = sfc.parse(fs.readFileSync(filename, 'utf8')).descriptor
const compiled = sfc.compileScript(descriptor, { id: 'expiry-test' }).content
const mod = new Module(filename)
mod.filename = filename
mod.paths = Module._nodeModulePaths(root + '/src')
mod.require = name => mocks[name] || require(name)
mod._compile(ts.transpileModule(compiled, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename)

;(async () => {
  const props = vue.reactive({ active: false, refreshKey: 'task1:old' })
  const api = mod.exports.default.setup(props, { expose() {} })
  assert.equal(pending.length, 0)
  props.active = true
  await vue.nextTick()
  assert.equal(api.loading.value, true)
  const old = pending.shift()
  props.refreshKey = 'task2:new'
  await vue.nextTick()
  const current = pending.shift()
  current.resolve({ warnDays: 90, items: [{ documentId: 'new-file', expire_days: 45 }] })
  await vue.nextTick()
  await vue.nextTick()
  old.resolve({ warnDays: 30, items: [{ documentId: 'stale-file' }] })
  await vue.nextTick()
  assert.equal(api.data.value.warnDays, 90)
  assert.equal(api.data.value.items[0].documentId, 'new-file')
  const retry = api.refresh()
  assert.equal(api.data.value, null)
  pending.shift().reject(new Error('读取失败'))
  await retry
  assert.equal(api.data.value, null)
  assert.match(api.error.value, /读取失败/)
  assert.equal(api.loading.value, false)
  const success = api.refresh()
  pending.shift().resolve({ warnDays: 90, items: [] })
  await success
  assert.equal(api.error.value, '')
  assert.deepEqual(api.data.value.items, [])
  const hidden = api.refresh()
  props.active = false
  await vue.nextTick()
  pending.shift().resolve({ warnDays: 90, items: [{ documentId: 'late' }] })
  await hidden
  assert.equal(api.data.value, null)
  for (const name of ['BidGenExpiryPanel', 'BidGenResultPanel']) {
    const file = root + `/src/components/bid-gen/${name}.vue`
    const parsed = sfc.parse(fs.readFileSync(file, 'utf8')).descriptor
    const result = sfc.compileTemplate({ source: parsed.template.content, filename: file, id: name })
    assert.deepEqual(result.errors, [])
  }
  console.log('Passed: lazy refresh, task switch ignores stale response, explicit failure, retry, hidden response ignored, templates compile')
})().catch(error => { console.error(error); process.exitCode = 1 })
