var EventsEmitter = require('events')
var fs = require('fs-extra')
var Path = require('path')
var chokidar = require('chokidar')
var Ffmpeg = require('fluent-ffmpeg')
var Logger = require('./Logger')
var playlistGenerator = require('./helpers/playlistGenerator')
var progressbar = require('./helpers/progressbar')
class StreamSession extends EventsEmitter {
  constructor(name, fileInfo, encodingOptions, outputPath = process.env.OUTPUT_PATH) {
    super()

    this.name = name
    this.fileInfo = fileInfo

    this.ffmpeg = null
    this.ffmpegLogLevel = '-loglevel warning'
    this.masterPlaylistName = 'master'
    this.encodingOptions = encodingOptions
    this.hasSubtitles = true

    this.streamPath = Path.resolve(outputPath, name)
    this.masterPlaylistPath = Path.resolve(this.streamPath, this.masterPlaylistName + '.m3u8')

    this.currentSegment = 0
    this.currentJobQuality = ''
    this.encodeStart = 0
    this.encodeComplete = false
    this.waitingForSegment = null

    this.segmentsCreated = {}
    this.segmentsFetched = {}

    this.watcher = null
    this.initWatcher()

    process.on('SIGINT', async () => {
      Logger.log('[PROCESS] Signal interruption')
      await this.cleanupMess('SIGINT')
      Logger.log('[PROCESS] Exited gracefully')
      process.exit(0)
    })
  }

  get url() {
    return `/${this.name}/${this.masterPlaylistName + '.m3u8'}`
  }

  get fileDurationPretty() {
    return this.fileInfo ? this.fileInfo.durationPretty : 'Unknown'
  }

  get currentPlaylistPath() {
    var qualityName = this.encodingOptions.selectedQualityName
    return Path.resolve(this.streamPath, qualityName + '.m3u8')
  }

  updateProgressBar() {
    var currentSegmentsCreated = this.segmentsCreated[this.currentJobQuality] || new Set()
    var currentSegmentsFetched = this.segmentsFetched[this.currentJobQuality] || new Set()
    var createdSegments = Array.from(currentSegmentsCreated.values())
    var fetchedSegments = Array.from(currentSegmentsFetched.values())
    progressbar.build(createdSegments, fetchedSegments, this.encodingOptions.numberOfSegments, this.currentSegment)
  }

  parseSegmentFilename(filepath) {
    var extname = Path.extname(filepath)
    if (extname !== '.ts') return false
    var basename = Path.basename(filepath, extname)
    var portions = basename.split('-')
    var variationName = portions[0]
    var segmentNumber = Number(portions[1])
    return {
      variation: variationName,
      number: segmentNumber
    }
  }

  setSegmentFetched(number, variation) {
    if (!this.segmentsFetched[variation]) this.segmentsFetched[variation] = new Set()
    this.segmentsFetched[variation].add(number)
    if (this.encodeComplete) {
      this.updateProgressBar()
    }
  }

  setSegmentCreated(number, variation) {
    if (!this.segmentsCreated[variation]) this.segmentsCreated[variation] = new Set()
    this.segmentsCreated[variation].add(number)
  }

  getIsSegmentCreated(number, variation) {
    if (!this.segmentsCreated[variation]) return false
    return this.segmentsCreated[variation].has(number)
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
      Logger.verbose('Playlist created')
      return
    }
    var segmentDetails = this.parseSegmentFilename(path)
    if (segmentDetails === false) {
      Logger.log('Invalid segment written', path)
      return
    }
    var { number, variation } = segmentDetails

    this.setSegmentCreated(number, variation)
    this.updateProgressBar()
  }

  async waitForSegment(segmentNumber, filePath, attempts = 0) {
    if (attempts === 0) this.waitingForSegment = segmentNumber
    if (attempts >= 10 || this.waitingForSegment !== segmentNumber) return false

    await new Promise((resolve) => setTimeout(resolve, 1000))

    var exists = await fs.pathExists(filePath)
    if (!exists) {
      Logger.log(`[REQUEST] Wait for segment ${segmentNumber} attempt ${attempts} failed`)
      return this.waitForSegment(segmentNumber, filePath, ++attempts)
    } else {
      return true
    }
  }

  getShouldStartNewEncode(segmentNumberRequested) {
    var distanceFromCurrentSegment = segmentNumberRequested - this.currentSegment
    if (distanceFromCurrentSegment > 10) {
      Logger.warn('Distance is too great... start new transcode')
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
    return playlistGenerator(this.fileInfo.filepath, this.masterPlaylistPath, this.streamPath, this.encodingOptions)
  }

  async run() {
    this.encodeStart = Date.now()
    this.encodeComplete = false
    this.currentJobQuality = this.encodingOptions.selectedQualityName

    if (Logger.isShowingProgressBar) {
      Logger.clearProgress()
    }

    Logger.session = this

    this.ffmpeg = Ffmpeg()
    this.ffmpeg.addInput(this.fileInfo.filepath)
    if (this.encodingOptions.segmentStart > 0) {
      this.ffmpeg.inputOption(`-ss ${this.encodingOptions.startTime}`)
      this.ffmpeg.inputOption('-noaccurate_seek')
    }

    var segmentFilename = Path.join(this.streamPath, `${this.encodingOptions.selectedQualityName}-%d.ts`)
    this.ffmpeg.addOption(this.ffmpegLogLevel)
      .addOption(this.encodingOptions.transcodeOptions)
      .addOption(this.encodingOptions.hlsOptions)
      .addOption(`-hls_segment_filename ${segmentFilename}`)
      .output(this.currentPlaylistPath)

    this.ffmpeg.on('start', (command) => {
      Logger.log('[INFO] FFMPEG transcoding started with command: ' + command)
      this.updateProgressBar()
    })

    this.ffmpeg.on('stderr', (stdErrline) => {
      Logger.clearProgress()
      Logger.error(stdErrline)
    })

    this.ffmpeg.on('error', (err, stdout, stderr) => {
      if (err.message && err.message.includes('SIGKILL')) {
        // This is an intentional SIGKILL
        Logger.info('[FFMPEG] Transcode Killed')
      } else {
        Logger.clearProgress()
        Logger.error('Ffmpeg Err', err.message)
        this.cleanupMess('FfmpegErr')
      }
    })

    this.ffmpeg.on('end', (stdout, stderr) => {
      this.emit('end', this.name)
      this.encodeComplete = true
      Logger.log('[FFMPEG] Transcoding ended')
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

  close() {
    this.cleanupMess('close')
  }

  cleanupMess(caller = 'unknown') {
    console.log('Cleaning up mess', caller)
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

  async restart(segmentNumber, qualityVariation = null) {
    var timeSinceLastRestart = Date.now() - this.encodeStart
    if (timeSinceLastRestart < 500) {
      Logger.error('Not restarting encode this quickly..')
      return false
    }

    if (qualityVariation !== null) {
      this.encodingOptions.setSelectedQuality(qualityVariation)

    }

    this.ffmpeg.kill('SIGKILL')
    this.waitingForSegment = null

    var startTime = this.encodingOptions.getSegmentStartTime(segmentNumber)

    Logger.clearProgress()
    Logger.log('Restart encode @', startTime + 's', 'Segment:', segmentNumber)

    this.encodingOptions.segmentStart = segmentNumber
    this.currentSegment = segmentNumber

    // Todo: This should wait for previous ffmpeg job to finish
    await new Promise((resolve) => setTimeout(resolve, 100))

    this.run()
    return true
  }
}
module.exports = StreamSession