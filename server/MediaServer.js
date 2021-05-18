var express = require('express')
var Path = require('path')
var fs = require('fs-extra')
var Logger = require('./helpers/logger')
var clientGenerator = require('./helpers/clientGenerator')
var StreamSession = require('./StreamSession')
var FileInfo = require('./FileInfo')
var EncodingOptions = require('./EncodingOptions')

class MediaServer {
  constructor(port = process.env.PORT, mediaPath = process.env.MEDIA_PATH) {
    this.PORT = port
    this.MEDIA_PATH = mediaPath

    this.sessions = {}

    this.start()
  }

  setHeaders(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', '*')
    res.setHeader("Access-Control-Allow-Headers", "*")
    if (req.method === 'OPTIONS') {
      res.send(200)
    } else {
      next()
    }
  }

  start() {
    var app = express()
    app.use(this.setHeaders)

    // Opens session and returns path to playlist file
    app.get('/open/:filename', (req, res) => this.handleStreamRequest(req, res, false))

    // Opens session and shows hls.js player
    app.get('/stream/:filename', (req, res) => this.handleStreamRequest(req, res, true))

    // Shows hls.js player with session
    app.get('/watch/:session', this.handleWatchRequest.bind(this))

    // Returns parsed metadata of video from ffprobe
    app.get('/probe/:filename', this.handleProbeRequest.bind(this))

    // Used by the client players to fetch .m3u8 and .ts file segments
    app.get('/:session/:file', this.handleFileRequest.bind(this))

    // List of files in media directory
    app.get('/', this.handleClientIndex.bind(this))

    app.listen(this.PORT, () => Logger.info('[SERVER] Listening on port', this.PORT))
  }

  async handleClientIndex(req, res) {
    var mediaPath = Path.resolve(this.MEDIA_PATH)
    await fs.ensureDir(mediaPath)

    try {
      var files = await fs.readdir(mediaPath)
      res.send(clientGenerator.media(files, mediaPath))
    } catch (err) {
      res.status(500).send(err)
    }
  }

  async handleProbeRequest(req, res) {
    var filename = req.params.filename
    var filepath = Path.resolve(this.MEDIA_PATH, filename)
    var exists = await fs.pathExists(filepath)
    if (!exists) {
      return res.sendStatus(404)
    }

    var fileInfo = new FileInfo(filepath)
    var successfullyProbed = await fileInfo.probe()
    if (!successfullyProbed) {
      Logger.error('Did not probe successfully')
      return res.sendStatus(500)
    }
    res.json(fileInfo.metadata)
  }

  handleWatchRequest(req, res) {
    var session = this.sessions[req.params.session]
    if (!session) res.sendStatus(404)
    res.send(clientGenerator.session(session))
  }

  handleStreamRequest(req, res, sendToPlayer) {
    var filename = req.params.filename
    var sessionName = req.query.name || Path.basename(filename, Path.extname(filename))
    if (this.sessions[sessionName]) {
      return res.status(500).send('Oops, a session is already running with this name')
    }
    this.openStream(res, sessionName, filename, sendToPlayer)
  }

  async handleFileRequest(req, res) {
    var sessionId = req.params.session
    var file = req.params.file

    var hlsSession = this.sessions[sessionId]
    if (!hlsSession) { // No Session
      Logger.error('Invalid session', sessionId)
      return res.sendStatus(400)
    }

    var filePath = Path.join(hlsSession.streamPath, file)
    var fileExtname = Path.extname(file)
    var isPlaylist = fileExtname === '.m3u8'
    var isSegment = fileExtname === '.ts'

    if (!isPlaylist && !isSegment) {
      Logger.error('Invalid file', req.url)
      res.statusCode = 400
      res.end()
    }

    var segmentNumber = 0

    if (isSegment) {
      var basename = Path.basename(file, fileExtname)
      segmentNumber = Number(basename.replace('index', ''))

      var distanceFromCurrentSegment = segmentNumber - hlsSession.currentSegment
      Logger.log('Fetching segment', segmentNumber, 'Distance', distanceFromCurrentSegment)
      if (distanceFromCurrentSegment === 10) {
        hlsSession.currentSegment++
      }
    } else {
      Logger.log('Fetching playlist', filePath)
    }

    var fileExists = hlsSession.segmentsFetched.has(segmentNumber) || await fs.pathExists(filePath)
    if (!fileExists) {
      if (!isSegment) {
        Logger.error('Playlist does not exist...', filePath)
        return res.sendStatus(400)
      }

      Logger.log('Segment does not exist...', filePath)

      if (hlsSession.getShouldStartNewEncode(segmentNumber)) {
        var isRestarted = await hlsSession.restart(segmentNumber)
        if (!isRestarted) {
          return res.sendStatus(500)
        }
      }

      var segmentLoaded = await hlsSession.waitForSegment(filePath)
      if (segmentLoaded) {
        Logger.log('Segment loaded now', segmentNumber)
        hlsSession.segmentsFetched.add(segmentNumber)
      } else {
        Logger.error('Segment still not loaded', segmentNumber)
        return res.sendStatus(404)
      }
    } else if (isSegment) {
      hlsSession.segmentsFetched.add(segmentNumber)
    }

    res.sendFile(filePath, (err) => {
      if (err) {
        Logger.error('Oops failed to send file', err)
      }
    })
  }

  async openStream(res, name, filename, sendToPlayer = false) {
    var filepath = Path.resolve(this.MEDIA_PATH, filename)
    var exists = await fs.pathExists(filepath)
    if (!exists) {
      Logger.log('File not found', filepath)
      return res.sendStatus(404)
    }

    var fileInfo = new FileInfo(filepath)
    var successfullyProbed = await fileInfo.probe()
    if (!successfullyProbed) {
      Logger.error('Did not probe successfully')
      return res.sendStatus(500)
    }

    var encodingOptions = new EncodingOptions(fileInfo)
    var streamSession = new StreamSession(name, fileInfo, encodingOptions)
    this.sessions[name] = streamSession

    await streamSession.generatePlaylist()
    streamSession.run()

    streamSession.on('close', () => {
      delete this.sessions[name]
    })

    if (sendToPlayer) {
      res.send(clientGenerator.session(streamSession))
    } else {
      res.send(`Stream open: ${streamSession.url}`)
    }
  }
}
module.exports = MediaServer