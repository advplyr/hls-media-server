var chokidar = require('chokidar')
var Path = require('path')

function initWatcher() {
  var paths = ['/media/test']
  this.watcher = chokidar.watch(paths, {
    ignoreInitial: true,
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 500
    }
  })
  this.watcher
    .on('add', (path) => {
      console.log('Added file', path)
      var extname = Path.extname(path)
      var basename = Path.basename(path, extname)
      console.log('BNASE', basename, 'ext', extname)

    }).on('error', (error) => {
      console.error(`[WATCHER] error: ${error}`)
    }).on('ready', () => {
      console.log(`[WATCHER] listening for segments at ${paths.join(',')}`)
    })
}
initWatcher()