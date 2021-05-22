var terminalOverwrite = require('terminal-overwrite')
const BOX_WIDTH = 104

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL

    this.progressLines = []
    this.currentLog = ''
    this.session = null
    this.isShowingProgressBar = false
  }

  get progressSessionName() {
    return this.session ? this.session.name : null
  }
  get progressSessionDuration() {
    return this.session ? this.session.fileDurationPretty : null
  }

  getBoxTopBottom(bottom = false) {
    var str = bottom ? '╚' : '╔'
    for (let i = 0; i < BOX_WIDTH - 2; i++) str += '═'
    return str + (bottom ? '╝' : '╗')
  }
  getBoxDivider(double = false) {
    var str = double ? '╠' : '╟'
    for (let i = 0; i < BOX_WIDTH - 2; i++) str += (double ? '═' : '┄')
    return str + (double ? '╣' : '╢')
  }
  getActualLength(str) {
    if (!str) return 0
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').length
  }

  padEnd(line, padchar = ' ') {
    var linelen = this.getActualLength(line)
    var numPadding = (BOX_WIDTH - 4) - linelen
    var padstr = ''
    for (let i = 0; i < numPadding; i++) padstr += padchar
    return line + padstr
  }

  padCenter(line, padchar = ' ') {
    var linelen = this.getActualLength(line)
    var numPadding = ((BOX_WIDTH - 4) - linelen)
    numPadding = Math.floor(numPadding / 2)

    var padstr = ''
    for (let i = 0; i < numPadding; i++) padstr += padchar
    return padstr + line + padstr
  }

  printProgress() {
    var top = this.getBoxTopBottom(false)
    var bottom = this.getBoxTopBottom(true)

    var titleLine = `${this.progressSessionName} (${this.progressSessionDuration})`
    var sessionNameLine = this.padCenter(titleLine)

    var log = this.currentLog
    var loglen = this.getActualLength(line)
    if (loglen > BOX_WIDTH - 4) log = this.currentLog.slice(0, BOX_WIDTH - 8) + '...'
    var lines = [sessionNameLine, '=', log, '-', ...this.progressLines]

    var logstr = top + '\n'
    lines.forEach((line) => {
      if (line === '-' || line === '=') {
        logstr += this.getBoxDivider(line === '=') + '\n'
      } else {
        logstr += '║ ' + this.padEnd(line) + ' ║\n'
      }
    })
    logstr += bottom

    terminalOverwrite(logstr)
  }

  clearProgress = () => {
    this.isShowingProgressBar = false
    console.log('>>>')
  }

  updateProgress = (...lines) => {
    this.isShowingProgressBar = true
    this.progressLines = lines
    this.printProgress()
  }

  verbose = (...msg) => {
    if (this.logLevel !== 'verbose') return
    if (this.isShowingProgressBar) {
      this.currentLog = msg.join(' ')
      return this.printProgress()
    }
    console.log(...msg)
  }

  log = (...msg) => {
    if (this.logLevel !== 'debug') return
    if (this.isShowingProgressBar) {
      this.currentLog = msg.join(' ')
      return this.printProgress()
    }
    console.log(...msg)
  }

  info = (...msg) => {
    if (this.isShowingProgressBar) {
      this.currentLog = msg.join(' ')
      return this.printProgress()
    }
    console.log(...msg)
  }

  warn = (...msg) => {
    if (this.isShowingProgressBar) {
      this.currentLog = msg.join(' ')
      return this.printProgress()
    }
    console.warn(...msg)
  }

  error = (...msg) => {
    if (this.isShowingProgressBar) {
      this.currentLog = msg.join(' ')
      return this.printProgress()
    }
    console.error(...msg)
  }
}
module.exports = new Logger()