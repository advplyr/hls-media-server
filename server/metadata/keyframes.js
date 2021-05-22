/*
  This file is unused.
  It fetches the key frames for a video and nice to have around.
*/

var spawn = require('child_process').spawn
var Path = require('path')

function probe(args, cmd = 'ffprobe') {
  return new Promise((resolve) => {
    var proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'] })
    var buff = ''
    proc.stdout.setEncoding("utf8")
    proc.stdout.on('data', function (data) {
      buff += data
    })
    proc.on('close', function () {
      resolve(buff)
    })
    proc.on('error', (err) => {
      console.log('Err', err)
      resolve(null)
    })
  })
}

async function start(filepath) {
  var path = Path.resolve(filepath)
  var probeargs = [
    '-v', 'error',
    '-skip_frame', 'nokey',
    '-show_entries', 'format=duration',
    '-show_entries', 'stream=duration,width,height',
    '-show_entries', 'packet=pts_time,flags',
    '-select_streams', 'v',
    '-of', 'csv',
    path
  ]
  var start = Date.now()
  var rawKeyframes = await probe(probeargs, 'ffprobe')
  if (!rawKeyframes) {
    return false
  }
  var keyframelines = rawKeyframes.split(/\r\n/).filter(l => l.length > 1)
  var formatline = keyframelines.pop()

  var format_duration = Number(formatline.split(',')[1])
  var streamline = keyframelines.pop().split(',')
  var stream_width = Number(streamline[1])
  var stream_height = Number(streamline[2])
  var stream_duration = Number(streamline[3])

  console.log('Format Duration', format_duration, 'Strema Duration', stream_duration, 'Resolution', `${stream_width}x${stream_height}`)
  var keyframes = keyframelines.filter(l => l.includes('K_')).map(l => Number(l.split(',')[1]))
  var dur = Date.now() - start
  console.log('Elapsed:', (dur / 1000).toFixed(2) + 's')
  console.log(keyframes)
}
module.exports = start
