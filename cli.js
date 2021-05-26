var Path = require('path')
var prober = require('./server/metadata/prober')
var hpg = require('hls-playlist-generator')

const args = process.argv.slice(2)

var cmd = args[0]
var input = args[1]
var filepath = Path.resolve(input)

if (cmd === 'probe') {
  prober(filepath).then((data) => {
    console.log(data)
  })
} else if (cmd === 'segs') {
  hpg(filepath).then((data) => {
    console.log(data)
  })
}