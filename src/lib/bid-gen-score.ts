import type { ScoreCheck, ScoreCheckVolume } from './bid-gen-api'

export function hasScoreCriteria(report: ScoreCheck): boolean {
  return report.items.length > 0
}

export function scoreValue(report: ScoreCheck, volume: ScoreCheckVolume): string {
  const estimated = report.items.some(item => item.volume === volume.volume && !item.deduction && item.estimatedScore != null)
  const externalMax = volume.externalMaxScore || 0
  const totalMax = volume.maxScore + externalMax
  const external = externalMax ? `；招标人评定 ${externalMax} 分` : ''
  return estimated && volume.estimatedScore != null
    ? `可自动估分 ${volume.estimatedScore} / ${volume.maxScore} 分${external}；总分 ${totalMax} 分`
    : `暂不可自动估分 / ${volume.maxScore} 分${external}；总分 ${totalMax} 分`
}

export function combinedEstimatedScore(report: ScoreCheck): number | null {
  const values = report.volumes
    .filter(volume => ['business', 'technical'].includes(volume.volume))
    .map(volume => hasVolumeEstimate(report, volume) ? volume.estimatedScore : null)
    .filter((value): value is number => value != null)
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}

function hasVolumeEstimate(report: ScoreCheck, volume: ScoreCheckVolume): boolean {
  return report.items.some(item => item.volume === volume.volume && !item.deduction && item.estimatedScore != null)
}

export function overallScoreLine(report: ScoreCheck): string {
  const volumes = report.volumes.filter(volume => ['business', 'technical'].includes(volume.volume))
  const estimated = combinedEstimatedScore(report)
  const businessVolume = volumes.find(volume => volume.volume === 'business')
  const technicalVolume = volumes.find(volume => volume.volume === 'technical')
  const business = businessVolume && hasVolumeEstimate(report, businessVolume) ? businessVolume.estimatedScore : null
  const technical = technicalVolume && hasVolumeEstimate(report, technicalVolume) ? technicalVolume.estimatedScore : null
  const breakdown = [
    business != null ? `商务 ${business}` : '商务待评估',
    technical != null ? `技术 ${technical}` : '技术待评估',
  ].join(' + ')
  return estimated != null
    ? `综合预估得分 ${estimated} 分（${breakdown}；价格评分未纳入）`
    : `综合预估得分暂不可评（${breakdown}；价格评分未纳入）`
}

export function fileScoreLines(report: ScoreCheck, key: string): string[] {
  if (!hasScoreCriteria(report)) return ['未识别评分标准 · 暂不可评分']
  const volumes = report.volumes.filter(volume => !['business', 'technical'].includes(key) || volume.volume === key)
  if (!volumes.length) return ['未识别该类型评分标准 · 暂不可评分']
  const lines = volumes.map(volume => `${volume.label}：${scoreValue(report, volume)}`)
  if (key === 'full' || key === 'bundle') lines.push(overallScoreLine(report))
  return lines
}
