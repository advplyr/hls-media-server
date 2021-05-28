var Path = require('path')
var fs = require('fs-extra')

module.exports.formatBytes = (bytes, decimals = 2) => {
  if (isNaN(bytes) || bytes === null) return 'N/A'
  if (bytes === 0) {
    return '0 Bytes'
  }
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

async function fetchAllFilesInDir(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = entries.filter(file => !file.isDirectory()).map(file => Path.join(dir, file.name))
  const folders = entries.filter(folder => folder.isDirectory())
  for (const folder of folders) {
    files.push(...await fetchAllFilesInDir(Path.join(dir, folder.name)))
  }
  return files
}

module.exports.fetchMediaFiles = async (dir) => {
  var VIDEO_FORMATS = ['.avi', '.mp4', '.mkv', '.m4v', '.m2ts']
  var files = await fetchAllFilesInDir(dir)
  return files.filter(filepath => {
    return VIDEO_FORMATS.includes(Path.extname(filepath))
  }).map((filepath) => {
    var _filepath = filepath.replace(dir, '')
    if (_filepath.startsWith('/')) return _filepath.substr(1)
    return _filepath
  })
}