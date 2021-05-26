var probeFile = require('./metadata/prober')
var { formatBytes } = require('./helpers/utils')

class FileInfo {
  constructor(filepath) {
    this.filepath = filepath
    this.metadata = {}
  }

  get duration() {
    return this.metadata.duration
  }
  get durationPretty() {
    var seconds = this.duration
    var minutes = Math.floor(seconds / 60)
    seconds = seconds - (minutes * 60)
    var hours = Math.floor(minutes / 60)
    minutes = minutes - (hours * 60)
    seconds = Math.trunc(seconds)
    if (hours > 0) return `${hours}hr ${minutes}m ${seconds}s`
    return `${minutes}m ${seconds}s`
  }

  get videoDisplayTitle() { return this.videoStream.display_title }
  get videoDisplaySize() { return `${this.videoWidth}x${this.videoHeight}` }
  get videoDisplayBitrate() { return this.videoBitrate ? formatBytes(this.videoBitrate) : 'N/A' }
  get videoDescription() { return `${this.videoDisplayTitle} [${this.videoDisplayBitrate}] (${this.videoDisplaySize})` }

  get audioDisplayTitle() { return this.audioStream ? this.audioStream.display_title : 'No Audio' }
  get audioDisplayBitrate() { return this.audioBitrate ? formatBytes(this.audioBitrate) : 'N/A' }
  get audioDescription() { return this.audioStream ? `${this.audioDisplayTitle} [${this.audioDisplayBitrate}]` : 'No Audio' }

  get videoStream() {
    return this.metadata.video_stream
  }
  get videoStreamResolution() {
    if (!this.metadata.video_stream) return null
    return this.metadata.video_stream.resolution
  }

  get videoStreamIndex() {
    return this.videoStream ? this.videoStream.index : null
  }

  get videoHeight() {
    return this.videoStream ? this.videoStream.height : null
  }

  get videoWidth() {
    return this.videoStream ? this.videoStream.width : null
  }

  get audioStream() {
    if (!this.metadata.audio_streams.length) return null
    return this.metadata.audio_streams.find(stream => stream.is_default) || this.metadata.audio_streams[0]
  }

  get audioStreamIndex() {
    return this.audioStream ? this.audioStream.index : null
  }

  get subtitleStream() {
    if (!this.metadata.subtitle_streams.length) return null
    return this.metadata.subtitle_streams.find(stream => stream.is_default) || this.metadata.subtitle_streams[0]
  }

  get videoCodec() {
    return this.videoStream ? this.videoStream.codec : null
  }

  get videoBitrate() {
    return this.videoStream ? this.videoStream.bit_rate : null
  }

  get frameRate() {
    return this.videoStream ? this.videoStream.frame_rate : null
  }

  get audioCodec() {
    return this.audioStream ? this.audioStream.codec : null
  }

  get audioBitrate() {
    return this.audioStream ? this.audioStream.bit_rate : null
  }

  get audioChannels() {
    return this.audioStream ? this.audioStream.channels : null
  }

  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) {
      return '0 Bytes'
    }
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
  }

  probe() {
    return probeFile(this.filepath).then((metadata) => {
      if (!metadata) return false
      this.metadata = metadata
      return true
    })
  }
}
module.exports = FileInfo