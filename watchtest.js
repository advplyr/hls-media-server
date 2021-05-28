var chokidar = require('chokidar')

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
    }).on('error', (error) => {
      console.error(`[WATCHER] error: ${error}`)
    }).on('ready', () => {
      console.log(`[WATCHER] listening for segments at ${paths.join(',')}`)
    })
}
initWatcher()