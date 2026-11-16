const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { test } = require('node:test')
const root = path.resolve(__dirname, '..')
const ts = require(root + '/node_modules/typescript')
const JSZip = require(root + '/node_modules/jszip')
const filename = root + '/src/lib/bid-gen-upload.ts'
const loaded = new Module(filename)
loaded.filename = filename
loaded.paths = Module._nodeModulePaths(root + '/src')
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename)
const { prepareDroppedBidUpload, prepareSelectedBidUpload, BID_UPLOAD_MAX_BYTES } = loaded.exports

const fileEntry = file => ({ name: file.name, isFile: true, isDirectory: false, file: resolve => resolve(file) })
function directory(name, batches) {
  return { name, isFile: false, isDirectory: true, createReader: () => {
    let index = 0
    return { readEntries: resolve => resolve(batches[index++] || []) }
  } }
}
const transfer = entries => ({ files: [], items: entries.map(entry => ({ kind: 'file', webkitGetAsEntry: () => entry })) })

test('single ZIP and DOCX uploads keep their original files', async () => {
  for (const name of ['招标文件.ZIP', '邀请书.docx']) {
    const file = new File(['source'], name)
    assert.equal(await prepareSelectedBidUpload([file]), file)
  }
})

test('folder drops read every directory batch and preserve nested files and archives', async () => {
  const nestedZip = new File(['nested ZIP bytes'], '招标.zip')
  const docx = new File(['Word bytes'], '邀请书.docx')
  const note = new File(['项目说明'], '说明.txt')
  const folder = directory('word', [[fileEntry(nestedZip)], [directory('补充资料', [[fileEntry(docx), fileEntry(note)]])]])
  const upload = await prepareDroppedBidUpload(transfer([folder]))
  assert.equal(upload.name, 'word.zip')
  const zip = await JSZip.loadAsync(await upload.arrayBuffer())
  assert.deepEqual(Object.keys(zip.files).sort(), ['word/招标.zip', 'word/补充资料/邀请书.docx', 'word/补充资料/说明.txt'].sort())
  assert.equal(await zip.file('word/招标.zip').async('string'), 'nested ZIP bytes')
  assert.equal(await zip.file('word/补充资料/说明.txt').async('string'), '项目说明')
})

test('folder picker and multiple loose files package all selected sources', async () => {
  const first = new File(['A'], 'a.docx')
  Object.defineProperty(first, 'webkitRelativePath', { value: 'word/目录/a.docx' })
  const second = new File(['B'], 'b.zip')
  Object.defineProperty(second, 'webkitRelativePath', { value: 'word/b.zip' })
  const upload = await prepareSelectedBidUpload([first, second])
  assert.equal(upload.name, 'word.zip')
  const zip = await JSZip.loadAsync(await upload.arrayBuffer())
  assert.ok(zip.file('word/目录/a.docx'))
  assert.ok(zip.file('word/b.zip'))
  const loose = await prepareSelectedBidUpload([new File(['C'], 'c.docx'), new File(['D'], 'd.zip')])
  const looseZip = await JSZip.loadAsync(await loose.arrayBuffer())
  assert.equal(Object.keys(looseZip.files).length, 2)
})

test('drop fallback uses FileList and ignores non-file drag items', async () => {
  const file = new File(['word'], '邀请书.docx')
  const upload = await prepareDroppedBidUpload({ files: [file], items: [{ kind: 'string' }] })
  assert.equal(upload, file)
})

test('folder traversal ignores macOS metadata and reports empty folders', async () => {
  const folder = directory('word', [[fileEntry(new File(['meta'], '.DS_Store')), fileEntry(new File(['x'], '._邀请书.docx')), fileEntry(new File(['doc'], '正文.docx'))]])
  const zip = await JSZip.loadAsync(await (await prepareDroppedBidUpload(transfer([folder]))).arrayBuffer())
  assert.deepEqual(Object.keys(zip.files), ['word/正文.docx'])
  await assert.rejects(prepareDroppedBidUpload(transfer([directory('空目录', [])])), /没有可上传文件|空/)
})

test('duplicate paths and unsafe paths are rejected before packaging', async () => {
  await assert.rejects(prepareSelectedBidUpload([new File(['a'], 'same.docx'), new File(['b'], 'same.docx')]), /重名|重复/)
  const file = new File(['x'], 'a.docx')
  Object.defineProperty(file, 'webkitRelativePath', { value: '../a.docx' })
  await assert.rejects(prepareSelectedBidUpload([file]), /路径/)
})

test('size limit is enforced before reading large files', async () => {
  await assert.rejects(prepareSelectedBidUpload([{ name: 'large.zip', size: BID_UPLOAD_MAX_BYTES + 1 }]), /200MB/)
  await assert.rejects(prepareSelectedBidUpload([{ name: 'a.docx', size: BID_UPLOAD_MAX_BYTES }, { name: 'b.zip', size: 1 }]), /200MB/)
})

test('unsupported individual files identify the rejected filename', async () => {
  await assert.rejects(prepareSelectedBidUpload([new File(['x'], '招标文件.rar')]), /招标文件\.rar.*ZIP|招标文件\.rar.*zip/)
  await assert.rejects(prepareSelectedBidUpload([new File(['x'], '邀请书.doc')]), /邀请书\.doc.*docx/)
})
