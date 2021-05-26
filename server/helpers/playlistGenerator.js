var fs = require('fs-extra')
var Path = require('path')
var hpg = require('hls-playlist-generator')

function getPlaylistVariation(qualityOption, frameRate, hasAudioStream) {
  var resolution = `${qualityOption.resolution * (3 / 2)}x${qualityOption.resolution}`
  var totalBitrate = qualityOption.videoBitrate
  // TODO: Set correct codec strings
  var videoCodecString = 'avc1.640029'
  var audioCodecString = 'mp4a.40.2'
  var codecStrings = [videoCodecString]
  if (hasAudioStream) {
    codecStrings.push(audioCodecString)
    totalBitrate += qualityOption.audioBitrate
  }

  // TODO: Set correct bandwidth & frame rate
  var variation = `#EXT-X-STREAM-INF:BANDWIDTH=${totalBitrate},AVERAGE-BANDWIDTH=${totalBitrate},VIDEO-RANGE=SDR,CODECS="${codecStrings.join(',')}",RESOLUTION=${resolution},FRAME-RATE=${frameRate}`
  variation += `\n${qualityOption.name}.m3u8`
  return variation
}

function generateMasterPlaylist(masterPlaylistPath, encodingOptions) {
  var m3u8 = '#EXTM3U'

  var frameRate = encodingOptions.encodeFrameRate
  encodingOptions.qualityOptions.forEach((qopt) => {
    m3u8 += '\n' + getPlaylistVariation(qopt, frameRate, !!encodingOptions.fileInfo.audioStream)
  })
  // var resolution = encodingOptions.videoDisplaySize
  // var variation = `#EXT-X-STREAM-INF:BANDWIDTH=${encodingOptions.bitrate},AVERAGE-BANDWIDTH=3003000,VIDEO-RANGE=SDR,CODECS="${codecStrings.join(',')}",RESOLUTION=${resolution},FRAME-RATE=23.976`
  // m3u8 += variation + '\n'
  // m3u8 += `${playlistName}.m3u8`
  return fs.writeFile(masterPlaylistPath, m3u8).then(() => {
    return true
  }).catch(error => {
    console.error('Failed to write m3u8 file', error)
    return false
  })
}

// Now generating playlist from https://github.com/mcoop320/hls-playlist-generator
// function generatePlaylist(playlistPath, segmentName, encodingOptions) {
//   var m3u8 = '#EXTM3U\n'
//   m3u8 += '#EXT-X-PLAYLIST-TYPE:VOD\n'
//   m3u8 += '#EXT-X-VERSION:3\n'
//   m3u8 += `#EXT-X-TARGETDURATION:${encodingOptions.segmentLength}\n`
//   m3u8 += '#EXT-X-MEDIA-SEQUENCE:0\n'

//   // For NTSC frame rates (23.97 and 29.97) the playlist will add 0.003 to segment lengths for 3 second segments.
//   // This resolves an issue when using integer segments for non-integer frame rates.
//   var segmentLengthStr = encodingOptions.actualSegmentLengthString
//   var actualSegmentLength = encodingOptions.actualSegmentLength
//   var numberOfFullSegments = encodingOptions.numberOfSegments - 1

//   var finalSegmentLen = encodingOptions.duration - (numberOfFullSegments * actualSegmentLength)
//   for (let i = 0; i < numberOfFullSegments; i++) {
//     m3u8 += `#EXTINF:${segmentLengthStr}\n${segmentName}${i}.ts\n`
//   }

//   m3u8 += `#EXTINF:${finalSegmentLen}\n${segmentName}${numberOfFullSegments}.ts\n`
//   m3u8 += '#EXT-X-ENDLIST'

//   return fs.writeFile(playlistPath, m3u8).then(() => {
//     return true
//   }).catch(error => {
//     console.error('Failed to write m3u8 file', error)
//     return false
//   })
// }

module.exports = (filepath, masterPlaylistPath, streamPath, encodingOptions) => {
  return generateMasterPlaylist(masterPlaylistPath, encodingOptions).then(async (mSuccess) => {
    if (!mSuccess) return false
    var segments = await hpg.segments(filepath, encodingOptions.segmentLength, encodingOptions.duration)
    encodingOptions.segmentTimestamps = segments

    await Promise.all(encodingOptions.qualityOptions.map((qopt) => {
      var playlistPath = Path.join(streamPath, `${qopt.name}.m3u8`)
      return hpg.generate(segments, playlistPath, qopt.name + '-')
    }))
    return segments.length
    // return hpg(filepath, playlistPath, encodingOptions.segmentLength)
  })
}