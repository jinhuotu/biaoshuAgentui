import JSZip from 'jszip/dist/jszip.min.js'

export const BID_UPLOAD_MAX_BYTES = 200 * 1024 * 1024
const MAX_FILES = 3000
const MAX_DIRECTORY_DEPTH = 32
const SUPPORTED_FILE = /\.(zip|docx)$/i

type UploadSource = { file: File; path: string }

function isHiddenPath(path: string): boolean {
  return path.split('/').some(part => part.startsWith('.') || part === '__MACOSX')
}

function validatePath(path: string) {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..' || part.includes(':'))) {
    throw new Error(`文件路径无效：${path}`)
  }
}

function sourceCollector() {
  const sources: UploadSource[] = []
  const paths = new Set<string>()
  let totalBytes = 0
  return {
    sources,
    add(file: File, path: string) {
      validatePath(path)
      if (isHiddenPath(path)) return
      if (paths.has(path)) throw new Error(`存在重名文件：${path}，请放入不同文件夹后再上传`)
      if (sources.length >= MAX_FILES) throw new Error(`文件数量超过 ${MAX_FILES} 个，请拆分后上传`)
      totalBytes += file.size
      if (totalBytes > BID_UPLOAD_MAX_BYTES) throw new Error('所选文件总大小超过 200MB，请拆分后上传')
      paths.add(path)
      sources.push({ file, path })
    },
  }
}

async function packageSources(sources: UploadSource[]): Promise<File> {
  if (!sources.length) throw new Error('文件夹中没有可上传文件，请选择包含招标文件的文件夹')
  if (!sources.some(source => SUPPORTED_FILE.test(source.file.name))) {
    throw new Error(`“${sources[0]!.path}”无法作为招标文件解析，请上传 ZIP 压缩包（.zip）或 Word 文件（.docx）；旧版 Word 请另存为 .docx`)
  }
  const only = sources.length === 1 ? sources[0] : undefined
  if (only && only.path === only.file.name) {
    if (!only.file.size) throw new Error(`文件为空：${only.file.name}`)
    return only.file
  }
  const archive = new JSZip()
  for (const source of sources) {
    archive.file(source.path, await source.file.arrayBuffer(), { createFolders: false })
  }
  // 原件可能已是 ZIP / DOCX；只封装一次，内层压缩包由后端按既有规则递归解析。
  const bytes = await archive.generateAsync({ type: 'uint8array', compression: 'STORE' })
  if (bytes.byteLength > BID_UPLOAD_MAX_BYTES) throw new Error('打包后文件超过 200MB，请拆分后上传')
  const folder = sources[0]!.path.split('/')[0]!
  const commonFolder = sources.every(source => source.path.startsWith(`${folder}/`))
  return new File([bytes], `${commonFolder ? folder : '招标文件合集'}.zip`, { type: 'application/zip' })
}

export async function prepareSelectedBidUpload(files: File[]): Promise<File> {
  const collected = sourceCollector()
  for (const file of files) collected.add(file, file.webkitRelativePath || file.name)
  return packageSources(collected.sources)
}

export async function prepareDroppedBidUpload(transfer: DataTransfer): Promise<File> {
  // 浏览器在 drop 事件返回后会保护 DataTransfer，必须在第一次 await 前取完句柄。
  const files = Array.from(transfer.files)
  const entries = Array.from(transfer.items ?? [])
    .filter(item => item.kind === 'file')
    .map(item => item.webkitGetAsEntry?.())
  if (!entries.length || entries.some(entry => !entry)) return prepareSelectedBidUpload(files)

  const collected = sourceCollector()
  let visitedEntries = 0
  async function visit(entry: FileSystemEntry, parent: string, depth: number): Promise<void> {
    const path = parent ? `${parent}/${entry.name}` : entry.name
    validatePath(path)
    if (isHiddenPath(path)) return
    visitedEntries += 1
    if (visitedEntries > MAX_FILES * 2 || depth > MAX_DIRECTORY_DEPTH) {
      throw new Error('文件夹条目过多或层级过深，请拆分后上传')
    }
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
      collected.add(file, path)
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      // Chromium 的 readEntries 每批通常最多 100 条，必须一直读取到空批次。
      while (true) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
        if (!batch.length) break
        for (const child of batch) await visit(child, path, depth + 1)
      }
    }
  }
  for (const entry of entries) await visit(entry!, '', 0)
  return packageSources(collected.sources)
}
