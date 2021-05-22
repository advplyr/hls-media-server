var chalk = require('chalk')
var Logger = require('../Logger')

const CHARACTERS = ['░', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█']

function getCharacterForPercentage(percentage) {
  var charindex = Math.floor(percentage * (CHARACTERS.length - 1))
  if (!CHARACTERS[charindex]) {
    console.error('Invalid character index', charindex, percentage)
    return 'X'
  }
  return CHARACTERS[charindex]
}

module.exports.build = (segmentsCreated, segmentsFetched, totalSegments, currentSegment) => {
  var segments = new Array(totalSegments)

  segmentsCreated.forEach((seg) => segments[seg] = 1)
  segmentsFetched.forEach((seg) => segments[seg] = 2)

  var percentageComplete = (segmentsCreated.length / totalSegments * 100).toFixed(2)
  var percentageFetched = (segmentsFetched.length / totalSegments * 100).toFixed(2)

  var numberOfChunks = 100
  if (totalSegments < numberOfChunks) numberOfChunks = totalSegments

  var segmentsPerChar = Math.floor(totalSegments / numberOfChunks)

  var progbar = ''
  var currbar = ''
  for (let i = 0; i < numberOfChunks; i++) {
    var chunkStart = i * segmentsPerChar
    var chunkEnd = i === numberOfChunks - 1 ? totalSegments : chunkStart + segmentsPerChar

    var isCurrentSegmentInChunk = currentSegment >= chunkStart && currentSegment < chunkEnd
    currbar += isCurrentSegmentInChunk ? chalk.green('▼') : ' '

    var chunk = []
    if (i === numberOfChunks - 1) chunk = segments.slice(chunkStart)
    else chunk = segments.slice(chunkStart, chunkEnd)

    var chunkSum = 0
    var segsInChunkFetched = 0
    chunk.forEach((seg) => {
      if (seg > 0) chunkSum++
      if (seg === 2) segsInChunkFetched++
    })

    var chunkColor = chunkSum === 0 ? 'gray' : 'white'
    var bgColor = chunkSum === 0 ? 'bgBlack' : 'bgGray'

    // All segments in chunk were fetched
    if (segsInChunkFetched === chunk.length) {
      chunkColor = 'green'
    }

    var perc = chunkSum / chunk.length
    var char = getCharacterForPercentage(perc)
    progbar += chalk[chunkColor][bgColor](char)
  }

  var progresslines = []

  var chunkstr = chalk.gray(`Number of Chunks: ${numberOfChunks}, Segs per Chunk: ${segmentsPerChar}`)
  if (Logger.logLevel === 'verbose') progresslines.push(chunkstr)

  var totalSegStr = chalk.inverse(` Total Segments: ${totalSegments} `)
  var currSegStr = chalk.inverse(` Current Segment: ${currentSegment} `)
  var percCompleteStr = chalk.inverse(` ${percentageComplete}% Created `)
  var percFetchedStr = chalk.inverse(` ${percentageFetched}% Fetched `)

  var summarystr = [totalSegStr, currSegStr, percCompleteStr, percFetchedStr].join(' ◈ ')
  progresslines.push(summarystr)
  progresslines.push(currbar)
  progresslines.push(progbar)

  Logger.updateProgress(...progresslines)
}