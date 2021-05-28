var Logger = require('./Logger')
var { formatBytes } = require('./helpers/utils')

const QualityOptions = [
  { name: '360p', resolution: 360, videoBitrate: 1200000, audioBitrate: 112000 },
  { name: '480p', resolution: 480, videoBitrate: 2400000, audioBitrate: 128000 },
  { name: '720p', resolution: 720, videoBitrate: 4000000, audioBitrate: 160000 },
  { name: '1080p', resolution: 1080, videoBitrate: 7200000, audioBitrate: 224000 }
]

class EncodingOptions {
  constructor(fileInfo, maxNetworkBitrate = 7200000) {
    this.segmentLength = 3
    this.segmentStart = 0
    this.segmentTimestamps = []

    this.hardcodeSubtitles = false

    this.numberOfSegments = 0 // Set when generating m3u8 playlist

    this.fileInfo = fileInfo

    // SET Quality Options
    this.qualityOptions = QualityOptions.filter(opt => (maxNetworkBitrate >= opt.videoBitrate && fileInfo.videoBitrate >= opt.videoBitrate))
    this.selectedQualityIndex = this.qualityOptions.length - 1

    if (this.canDirectStreamVideo) {
      var dsOption = { name: this.fileInfo.videoStreamResolution + '_direct', resolution: this.fileInfo.videoHeight, videoBitrate: this.fileInfo.videoBitrate, audioBitrate: this.fileInfo.audioBitrate, isDirectStream: true }
      var indexToInsert = this.qualityOptions.findIndex(opt => opt.videoBitrate < dsOption.videoBitrate)
      if (indexToInsert < 0) {
        indexToInsert = this.qualityOptions.length
        this.qualityOptions.push(dsOption)
      } else this.qualityOptions.splice(indexToInsert, 0, dsOption)
      this.selectedQualityIndex = indexToInsert
    }

    if (!this.qualityOptions.length) {
      Logger.error('No Quality Options', fileInfo.videoBitrate)
      this.selectedQualityIndex = 0
      this.qualityOptions = [QualityOptions[0]]
    }
  }

  get resolutionWidth() {
    return this.resolutionHeight * (3 / 2)
  }
  get resolutionHeight() {
    return this.selectedQuality.resolution
  }
  get videoBitrate() {
    return this.selectedQuality.videoBitrate
  }
  get audioBitrate() {
    return this.selectedQuality.audioBitrate
  }
  get selectedQuality() {
    return this.qualityOptions[this.selectedQualityIndex]
  }
  get selectedQualityName() {
    if (!this.selectedQuality) {
      Logger.error('No Quality Selected')
      return 'ERROR'
    }
    return this.selectedQuality.name
  }
  get startTime() {
    return this.getSegmentStartTime(this.segmentStart)
  }

  get actualSegmentLengthString() {
    var segmentLengthAdjustment = this.frameRateNTSC ? this.segmentLength : 0
    return `${this.segmentLength}.00${segmentLengthAdjustment}000`
  }
  get actualSegmentLength() { return Number(this.actualSegmentLengthString) }

  get videoDisplaySize() { return `${this.encodeSize.width}x${this.encodeSize.height}` }
  get videoDisplayBitrate() { return formatBytes(this.videoBitrate) }
  get encodeVideoDisplay() { return `${this.videoEncoder} [${this.videoDisplayBitrate}] (${this.videoDisplaySize})` }
  get audioDisplayBitrate() { return formatBytes(this.audioBitrate) }
  get encodeAudioDisplay() { return this.fileInfo.audioStream ? `${this.audioEncoder} ${this.audioChannels}ch [${this.audioDisplayBitrate}]` : 'No Audio' }

  get duration() {
    return this.fileInfo.duration
  }

  get encodeSize() {
    var videoAspectRatio = (this.fileInfo.videoHeight && this.fileInfo.videoWidth) ? this.fileInfo.videoWidth / this.fileInfo.videoHeight : null

    var width = this.resolutionWidth
    var height = videoAspectRatio ? Math.trunc(width / videoAspectRatio) : this.resolutionHeight
    return {
      width,
      height
    }
  }

  get encodeFrameRate() {
    return this.fileInfo.frameRate || 24
  }

  get frameRateNTSC() {
    return this.encodeFrameRate % 1 !== 0
  }

  get audioEncoder() {
    return 'aac'
  }

  get audioChannels() {
    return this.fileInfo.audioChannels
  }

  get videoEncoder() {
    return 'libx264'
  }

  get canDirectStreamVideo() {
    return this.fileInfo.videoCodec === 'h264'
  }

  get canDirectStreamAudio() {
    var codecsSupported = ['aac']
    return codecsSupported.includes(this.fileInfo.audioCodec)
  }

  get videoTranscodeOptions() {
    if (this.canDirectStreamVideo) {
      return ['-c:v copy']
    }
    var scaler = ''
    if (this.fileInfo.subtitleStream && this.hardcodeSubtitles) {
      scaler = `-filter_complex [0:2]scale=${this.encodeSize.width}x${this.encodeSize.height}[sub];[0:0]scale=\'trunc(min(max(iw,ih*dar),${this.encodeSize.width})/2)*2\':\'trunc(ow/dar/2)*2\'[base];[base][sub]overlay`
    } else {
      scaler = `-vf scale=\'trunc(min(max(iw,ih*dar),${this.encodeSize.width})/2)*2\':\'trunc(ow/dar/2)*2\'`
    }
    return [
      `-codec:v:0 ${this.videoEncoder}`,
      '-pix_fmt yuv420p',
      '-preset veryfast',
      '-crf 23',
      `-maxrate ${this.videoBitrate}`,
      `-bufsize ${this.videoBitrate * 2}`,
      '-profile:v:0 high',
      '-level 41',
      scaler
    ]
  }

  get transcodeOptions() {
    var maps = [`-map 0:${this.fileInfo.videoStreamIndex}`]

    if (this.fileInfo.audioStream) {
      maps.push(`-map 0:${this.fileInfo.audioStreamIndex}`)
    }
    if (!this.fileInfo.subtitleStream || !this.hardcodeSubtitles) {
      maps.push('-map -0:s') // Do not include subtitle stream
    }
    var frameRate = this.encodeFrameRate
    var gopSize = frameRate * this.segmentLength

    var options = [
      '-threads 0',
      '-map_metadata -1',
      '-map_chapters -1',
      ...maps,
      `-r ${frameRate}`,
      '-sc_threshold 0', // Disable scene detection cuts. Could be a bad move.
      ...this.videoTranscodeOptions,
      '-start_at_zero',
      '-vsync -1',
      '-g ' + gopSize,
      // `-x264opts subme=0:me_range=4:rc_lookahead=10:me=dia:no_chroma_me:8x8dct=0:partitions=none`,
      // `-force_key_frames expr:gte(t,${this.segmentStart * this.segmentLength}+n_forced*${this.segmentLength})`
      // The Jellyfin method of getting static segment lengths for x264 encodes. This is a) not codec neutral and b) every 10 - 15th segment was off.
      /*
      `-force_key_frames expr:gte(t,${this.segmentStart * this.segmentLength}+n_forced*${this.segmentLength})`,
      `-x264opts subme=0:me_range=4:rc_lookahead=10:me=dia:no_chroma_me:8x8dct=0:partitions=none`,
      */
    ]
    if (this.fileInfo.audioStream) {
      if (this.canDirectStreamAudio) {
        options.push(`-c:a copy`)
      } else {
        options.push(`-codec:a:0 ${this.audioEncoder}`) // Todo: select correct audio index here
        options.push(`-ac ${this.audioChannels}`)
        options.push(`-ab ${this.audioBitrate}`)
      }
      // Audio stream to start at the same position as video stream, padding with silence if needed.
      // Taken From: https://videoblerg.wordpress.com/2017/11/10/ffmpeg-and-how-to-use-it-wrong/
      // REMOVED: Audio sync breaks seeking, segment length still static using gopSize
      // options.push('-af aresample=async=1:min_hard_comp=0.100000:first_pts=0')
    }
    return options
  }

  get hlsOptions() {
    return [
      '-f hls',
      "-copyts",
      "-avoid_negative_ts disabled",
      "-max_delay 5000000",
      "-max_muxing_queue_size 2048",
      `-hls_time ${this.segmentLength}`,
      "-hls_segment_type mpegts",
      `-start_number ${this.segmentStart}`,
      "-hls_playlist_type vod",
      "-hls_list_size 0",
      "-hls_allow_cache 0"
    ]
  }

  getSegmentStartTime(segmentNumber) {
    var time = 0
    for (let i = 0; i < segmentNumber; i++) {
      if (this.segmentTimestamps.length > i) {
        time += this.segmentTimestamps[i]
      }
    }
    return time
  }

  setSelectedQuality(name) {
    var qualityIndex = this.qualityOptions.findIndex(qopt => qopt.name === name)
    if (qualityIndex < 0) {
      Logger.error('Quality not found', name)
      return false
    }
    this.selectedQualityIndex = qualityIndex
    return true
  }
}
module.exports = EncodingOptions
