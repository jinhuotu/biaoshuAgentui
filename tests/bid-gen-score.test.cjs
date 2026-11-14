const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const root = path.resolve(__dirname, '..')
const ts = require(root + '/node_modules/typescript')
const sfc = require(root + '/node_modules/@vue/compiler-sfc')
const file = root + '/src/lib/bid-gen-score.ts'
const mod = new Module(file)
mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file)
const { combinedEstimatedScore, fileScoreLines, hasScoreCriteria, overallScoreLine } = mod.exports
const empty = { items: [], volumes: [], passed: true, coverage: 0 }
assert.equal(hasScoreCriteria(empty), false)
assert.deepEqual(fileScoreLines(empty, 'business'), ['未识别评分标准 · 暂不可评分'])
const report = {
  items: [{ volume: 'business', estimatedScore: 0 }, { volume: 'technical', estimatedScore: null }, { volume: 'price', estimatedScore: null }],
  volumes: [
    { volume: 'business', label: '商务评分', estimatedScore: 0, maxScore: 6 },
    { volume: 'technical', label: '技术评分', estimatedScore: 0, maxScore: 54 },
    { volume: 'price', label: '报价评分', estimatedScore: null, maxScore: 40 },
  ],
}
assert.deepEqual(fileScoreLines(report, 'business'), ['商务评分：可自动估分 0 / 6 分；总分 6 分'])
assert.deepEqual(fileScoreLines(report, 'technical'), ['技术评分：暂不可自动估分 / 54 分；总分 54 分'])
assert.deepEqual(fileScoreLines(report, 'full'), [
  '商务评分：可自动估分 0 / 6 分；总分 6 分',
  '技术评分：暂不可自动估分 / 54 分；总分 54 分',
  '报价评分：暂不可自动估分 / 40 分；总分 40 分',
  '综合预估得分 0 分（商务 0 + 技术待评估；价格评分未纳入）',
])
assert.deepEqual(fileScoreLines(report, 'bundle'), fileScoreLines(report, 'full'))
assert.equal(combinedEstimatedScore(report), 0)
assert.equal(overallScoreLine(report), '综合预估得分 0 分（商务 0 + 技术待评估；价格评分未纳入）')
const weightedReport = {
  items: [
    { volume: 'business', deduction: false, estimatedScore: 30 },
    { volume: 'technical', deduction: false, estimatedScore: 20 },
  ],
  volumes: [
    { volume: 'business', label: '商务评分', estimatedScore: 30, maxScore: 100, externalMaxScore: 0 },
    { volume: 'technical', label: '技术评分', estimatedScore: 20, maxScore: 73, externalMaxScore: 27 },
  ],
}
assert.deepEqual(fileScoreLines(weightedReport, 'technical'), ['技术评分：可自动估分 20 / 73 分；招标人评定 27 分；总分 100 分'])
assert.equal(overallScoreLine(weightedReport), '综合预估得分 50 分（商务 30 + 技术 20；价格评分未纳入）')
for (const name of ['BidGenResultPanel', 'BidGenTenderPanel']) {
  const filename = root + `/src/components/bid-gen/${name}.vue`
  const descriptor = sfc.parse(fs.readFileSync(filename, 'utf8')).descriptor
  const compiled = sfc.compileTemplate({ source: descriptor.template.content, filename, id: name })
  assert.deepEqual(compiled.errors, [])
}
console.log('Passed: old empty reports, real zero vs unknown score, per-file scores, full/bundle summaries, templates')
