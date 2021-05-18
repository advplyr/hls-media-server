var fs = require('fs-extra')

module.exports = (playlistPath, segmentName, encodingOptions) => {
  var m3u8 = '#EXTM3U\n'
  m3u8 += '#EXT-X-PLAYLIST-TYPE:VOD\n'
  m3u8 += '#EXT-X-VERSION:3\n'
  m3u8 += `#EXT-X-TARGETDURATION:${encodingOptions.segmentLength}\n`
  m3u8 += '#EXT-X-MEDIA-SEQUENCE:0\n'

  var segments = Math.floor(encodingOptions.duration / encodingOptions.segmentLength)
  var finalSegmentLen = encodingOptions.duration - (segments * encodingOptions.segmentLength)

  for (let i = 0; i < segments; i++) {
    m3u8 += `#EXTINF:${encodingOptions.segmentLength}.0000,\n${segmentName}${i}.ts\n`
  }

  m3u8 += `#EXTINF:${finalSegmentLen},\n${segmentName}${segments}.ts\n`
  m3u8 += '#EXT-X-ENDLIST'

  return fs.writeFile(playlistPath, m3u8).then(() => {
    return true
  }).catch(error => {
    console.error('Failed to write m3u8 file', error)
    return false
  })
}