var loglevel = process.env.LOG_LEVEL

module.exports.log = (...msg) => {
  if (loglevel !== 'debug') return
  console.log(...msg)
}

module.exports.info = (...msg) => {
  console.log(...msg)
}

module.exports.warn = (...msg) => {
  console.warn(...msg)
}

module.exports.error = (...msg) => {
  console.error(...msg)
}