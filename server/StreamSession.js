var EventsEmitter = require('events')
var fs = require('fs-extra')
var Path = require('path')
var chokidar = require('chokidar')
var Ffmpeg = require('fluent-ffmpeg')
var Logger = require('./helpers/logger')
var playlistGenerator = require('./helpers/playlistGenerator')

class StreamSession extends EventsEmitter {
  constructor(name, fileInfo, encodingOptions, outputPath = process.env.OUTPUT_PATH) {
    super()

    this.name = name
    this.fileInfo = fileInfo

    this.ffmpeg = null
    this.ffmpegLogLevel = '-loglevel warning'
    this.playlistName = 'index'
    this.segmentName = 'index'
    this.encodingOptions = encodingOptions

    this.streamPath = Path.resolve(outputPath, name)
    this.playlistPath = Path.resolve(this.streamPath, this.playlistName + '.m3u8')

    this.currentSegment = 0
    this.encodeStart = 0
    this.segmentsFetched = new Set()
    this.segmentsCreated = new Set()

    this.watcher = null
    this.initWatcher()

    process.on('SIGINT', async () => {
      Logger.log('Signal interruption')
      await this.cleanupMess()
      Logger.log('Exited gracefully, my liege')
      process.exit(0)
    })
  }

  get url() {
    return `http://localhost:4000/${this.name}/${this.playlistName + '.m3u8'}`
  }

  getSegmentNumberFromPath(path) {
    var extname = Path.extname(path)
    if (extname !== '.ts') return false
    var basename = Path.basename(path, extname).replace(this.segmentName, '')
    if (isNaN(basename)) return false
    return Number(basename)
  }

  initWatcher() {
    this.watcher = chokidar.watch(this.streamPath, {
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
        this.onNewFile(path)
      }).on('error', (error) => {
        Logger.log(`[WATCHER] error: ${error}`)
      }).on('ready', () => {
        Logger.log(`[WATCHER] listening for segments at ${this.streamPath}`)
      })
  }

  onNewFile(path) {
    if (path.endsWith('.m3u8')) {
      Logger.log('Playlist created')
      return
    }
    var segment = this.getSegmentNumberFromPath(path)
    if (segment === false) {
      Logger.log('Invalid segment written', path)
      return
    }
    Logger.log('New segment created', segment)
    this.segmentsCreated.add(segment)
  }

  async waitForSegment(filePath, attempts = 0) {
    if (attempts >= 5) return false

    await new Promise((resolve) => setTimeout(resolve, 1000))

    var exists = await fs.pathExists(filePath)
    if (!exists) {
      Logger.log('Wait for seg attempt', attempts, 'failed')
      return this.waitForSegment(filePath, ++attempts)
    } else {
      return true
    }
  }

  getShouldStartNewEncode(segmentNumberRequested) {
    var distanceFromCurrentSegment = segmentNumberRequested - this.currentSegment
    if (distanceFromCurrentSegment > 10) {
      Logger.warn('Dsitance is too great... start new transcode')
      return true
    } else if (distanceFromCurrentSegment < 0) {
      Logger.warn('This is in the past... start new trasnscode')
      return true
    } else {
      return false
    }
  }

  getTimestamp(seconds) {
    var minutes = Math.floor(seconds / 60)
    var seconds_remaining = seconds - (minutes * 60)
    var hours = Math.floor(minutes / 60)
    minutes = minutes - (60 * hours)

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds_remaining).padStart(2, '0')}`
  }

  async generatePlaylist() {
    await fs.ensureDir(this.streamPath)
    return playlistGenerator(this.playlistPath, this.segmentName, this.encodingOptions)
  }

  async run() {
    this.encodeStart = Date.now()

    this.ffmpeg = Ffmpeg()
    this.ffmpeg.addInput(this.fileInfo.filepath)
    if (this.encodingOptions.segmentStart > 0) {
      var startTime = this.encodingOptions.segmentStart * this.encodingOptions.segmentLength
      var startTimestamp = this.getTimestamp(startTime)
      this.ffmpeg.inputOption(`-ss ${startTimestamp}`)
      this.ffmpeg.inputOption('-noaccurate_seek')
    }

    this.ffmpeg.addOption(this.ffmpegLogLevel)
      .addOption(this.encodingOptions.transcodeOptions)
      .addOption(this.encodingOptions.hlsOptions)
      .output(this.playlistPath)

    this.ffmpeg.on('start', (command) =>
      Logger.log('[INFO] FFMPEG transcoding started with command: ' + command)
    )

    this.ffmpeg.on('stderr', (stdErrline) =>
      Logger.error(stdErrline)
    )

    this.ffmpeg.on('error', (err, stdout, stderr) => {
      Logger.error(err.message)
      this.cleanupMess()
    })

    this.ffmpeg.on('end', (stdout, stderr) => {
      this.emit('end', this.name)
      Logger.log('[INFO] Transcoding ended')
    })

    this.ffmpeg.run()
  }

  deleteAllFiles() {
    Logger.log('deleteAllFiles for', this.streamPath)
    return fs.remove(this.streamPath).then(() => {
      Logger.log('Deleted session data', this.streamPath)
      return true
    }).catch((err) => {
      Logger.error('Failed to delete session data', err)
      return false
    })
  }

  cleanupMess() {
    this.stop()
    return this.deleteAllFiles()
  }

  stop() {
    if (this.watcher) {
      this.watcher.removeAllListeners()
      this.watcher = null
    }

    this.emit('close')

    if (!this.ffmpeg) return

    Logger.log('Killing ffmpeg')
    this.ffmpeg.kill('SIGKILL')
  }

  async restart(segmentNumber) {
    var timeSinceLastRestart = Date.now() - this.encodeStart
    if (timeSinceLastRestart < 500) {
      Logger.error('Not restarting encode this quickly..')
      return false
    }

    this.ffmpeg.kill('SIGKILL')

    var startTime = segmentNumber * this.encodingOptions.segmentLength
    Logger.log('Restart encode @', startTime + 's', 'Segment:', segmentNumber)

    this.encodingOptions.segmentStart = segmentNumber
    this.currentSegment = segmentNumber

    await new Promise((resolve) => setTimeout(resolve, 100))

    this.run()
    return true
  }
}
module.exports = StreamSession