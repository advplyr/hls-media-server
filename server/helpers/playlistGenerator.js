var fs = require('fs-extra')

function generateMasterPlaylist(masterPlaylistPath, playlistName, encodingOptions) {
  var m3u8 = '#EXTM3U\n'

  // TODO: Set correct codec strings
  var videoCodecString = 'avc1.640029'
  var audioCodecString = 'mp4a.40.2'
  var codecStrings = [videoCodecString]
  if (encodingOptions.fileInfo.audioStream) {
    codecStrings.push(audioCodecString)
  }

  var resolution = encodingOptions.videoDisplaySize

  // TODO: Set correct bandwidth & frame rate
  var variation = `#EXT-X-STREAM-INF:BANDWIDTH=3003000,AVERAGE-BANDWIDTH=3003000,VIDEO-RANGE=SDR,CODECS="${codecStrings.join(',')}",RESOLUTION=${resolution},FRAME-RATE=23.976`

  m3u8 += variation + '\n'
  m3u8 += `${playlistName}.m3u8`

  return fs.writeFile(masterPlaylistPath, m3u8).then(() => {
    return true
  }).catch(error => {
    console.error('Failed to write m3u8 file', error)
    return false
  })
}

// TODO: Audio segment length is not the same, need to find a way to get audio segment length
// E.g. https://stackoverflow.com/questions/58898638/precise-method-of-segmenting-transcoding-videoaudio-via-ffmpeg-into-an-on
function generatePlaylist(playlistPath, segmentName, encodingOptions) {
  var m3u8 = '#EXTM3U\n'
  m3u8 += '#EXT-X-PLAYLIST-TYPE:VOD\n'
  m3u8 += '#EXT-X-VERSION:3\n'
  m3u8 += `#EXT-X-TARGETDURATION:${encodingOptions.segmentLength}\n`
  m3u8 += '#EXT-X-MEDIA-SEQUENCE:0\n'

  // For NTSC frame rates (23.97 and 29.97) the playlist will add 0.003 to segment lengths for 3 second segments.
  // This resolves an issue when using integer segments for non-integer frame rates.
  var segmentLengthStr = encodingOptions.actualSegmentLengthString
  var actualSegmentLength = encodingOptions.actualSegmentLength
  var numberOfFullSegments = encodingOptions.numberOfSegments - 1

  var finalSegmentLen = encodingOptions.duration - (numberOfFullSegments * actualSegmentLength)
  for (let i = 0; i < numberOfFullSegments; i++) {
    m3u8 += `#EXTINF:${segmentLengthStr}\n${segmentName}${i}.ts\n`
  }

  m3u8 += `#EXTINF:${finalSegmentLen}\n${segmentName}${numberOfFullSegments}.ts\n`
  m3u8 += '#EXT-X-ENDLIST'

  return fs.writeFile(playlistPath, m3u8).then(() => {
    return true
  }).catch(error => {
    console.error('Failed to write m3u8 file', error)
    return false
  })
}


module.exports = (masterPlaylistPath, playlistPath, playlistName, segmentName, encodingOptions) => {
  return generateMasterPlaylist(masterPlaylistPath, playlistName, encodingOptions).then((mSuccess) => {
    if (!mSuccess) return false

    return generatePlaylist(playlistPath, segmentName, encodingOptions).then((pSuccess) => {
      return pSuccess
    })
  })
}