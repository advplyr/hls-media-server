var { formatBytes } = require('./helpers/utils')

class EncodingOptions {
  constructor(fileInfo) {
    this.segmentLength = 3
    this.segmentStart = 0

    this.encodeVideoBitrate = 4000000
    this.encodeAudioBitrate = 192000

    this.resolutionWidth = 1280
    this.resolutionHeight = 720
    this.hardcodeSubtitles = false

    this.fileInfo = fileInfo
  }

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

  get audioBitrate() {
    if (!this.fileInfo.audioBitrate) return this.encodeAudioBitrate
    return this.fileInfo.audioBitrate < this.encodeAudioBitrate ? this.fileInfo.audioBitrate : this.encodeAudioBitrate
  }

  get audioEncoder() {
    return 'aac'
  }

  get audioChannels() {
    return this.fileInfo.audioChannels
  }

  get videoBitrate() {
    if (!this.fileInfo.videoBitrate) return this.encodeVideoBitrate
    return this.fileInfo.videoBitrate < this.encodeVideoBitrate ? this.fileInfo.videoBitrate : this.encodeVideoBitrate
  }

  get videoEncoder() {
    return 'libx264'
  }

  get transcodeOptions() {
    var scaler = ''

    var maps = [`-map 0:${this.fileInfo.videoStreamIndex}`]

    if (this.fileInfo.audioStream) {
      maps.push(`-map 0:${this.fileInfo.audioStreamIndex}`)
    }

    if (this.fileInfo.subtitleStream && this.hardcodeSubtitles) {
      scaler = `-filter_complex [0:2]scale=${this.encodeSize.width}x${this.encodeSize.height}[sub];[0:0]scale=\'trunc(min(max(iw,ih*dar),${this.encodeSize.width})/2)*2\':\'trunc(ow/dar/2)*2\'[base];[base][sub]overlay`
    } else {
      scaler = `-vf scale=\'trunc(min(max(iw,ih*dar),${this.encodeSize.width})/2)*2\':\'trunc(ow/dar/2)*2\'`

      if (this.fileInfo.subtitleStream) {
        maps.push('-map -0:s') // Do not include subtitle stream
      }
    }

    var options = [
      '-map_metadata -1',
      '-map_chapters -1',
      ...maps,
      `-codec:v:0 ${this.videoEncoder}`,
      '-pix_fmt yuv420p',
      '-preset veryfast',
      '-crf 23',
      `-maxrate ${this.videoBitrate}`,
      `-bufsize ${this.videoBitrate * 2}`,
      '-profile:v:0 high',
      '-level 41',
      `-force_key_frames:0 expr:gte(t,${this.segmentStart * this.segmentLength}+n_forced*${this.segmentLength})`,
      '-x264opts:0 subme=0:me_range=4:rc_lookahead=10:me=dia:no_chroma_me:8x8dct=0:partitions=none',
      scaler,
      '-start_at_zero',
      '-vsync -1'
    ]
    if (this.fileInfo.audioStream) {
      options.push(`-codec:a:0 ${this.audioEncoder}`) // Todo: select correct audio index here
      options.push(`-ac ${this.audioChannels}`)
      options.push(`-ab ${this.audioBitrate}`)
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
}
module.exports = EncodingOptions