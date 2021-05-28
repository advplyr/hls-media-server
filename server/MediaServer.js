var express = require('express')
var Path = require('path')
var fs = require('fs-extra')
var Sqrl = require('squirrelly')

var Logger = require('./Logger')
var { fetchMediaFiles } = require('./helpers/utils')
var StreamSession = require('./StreamSession')
var FileInfo = require('./FileInfo')
var EncodingOptions = require('./EncodingOptions')


class MediaServer {
  constructor(port = process.env.PORT, mediaPath = process.env.MEDIA_PATH) {
    this.PORT = port
    this.MEDIA_PATH = mediaPath

    this.sessions = {}
    this.clients = {}

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
    app.use(express.static('public'))
    app.set('views', './views')
    app.engine('html', Sqrl.renderFile)
    app.set('view engine', 'html')

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

    // Client server event to track when client disconnects
    app.get('/events', this.handleClientEvent.bind(this))

    // List of files in media directory
    app.get('/', this.handleClientIndex.bind(this))

    app.listen(this.PORT, () => Logger.info('[SERVER] Listening on port', this.PORT))
  }

  async handleClientIndex(req, res) {
    var mediaPath = Path.resolve(this.MEDIA_PATH)
    await fs.ensureDir(mediaPath)
    // var files = await fs.readdir(mediaPath)
    var files = await fetchMediaFiles(mediaPath)
    res.render('index', {
      title: 'Files',
      mediaPath: mediaPath,
      video_files: files
    })
  }

  async handleClientEvent(req, res) {
    const headers = {
      'Content-Type': 'text/event-stream',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache'
    }
    res.writeHead(200, headers)

    const requestIp = (typeof req.headers['x-forwarded-for'] === 'string' && req.headers['x-forwarded-for'].split(',').shift()) || req.connection.remoteAddress
    if (!requestIp) {
      console.error('No IP', requestIp)
      return
    }

    if (!this.clients[requestIp]) {
      this.clients[requestIp] = {
        id: requestIp,
        response: res
      }
    } else {
      this.clients[requestIp].response = res
    }

    req.on('close', () => {
      console.log(`${requestIp} Connection closed`)
      if (this.clients[requestIp]) {
        var sessionName = this.clients[requestIp].session
        if (sessionName && this.sessions[sessionName]) {
          this.sessions[sessionName].close()
        }
      }
      delete this.clients[requestIp]
    })
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
    var sessionName = req.query.name || Path.basename(filename)
    if (this.sessions[sessionName]) {
      return res.status(500).send('Oops, a session is already running with this name')
    }
    const requestIp = (typeof req.headers['x-forwarded-for'] === 'string' && req.headers['x-forwarded-for'].split(',').shift()) || req.connection.remoteAddress
    this.openStream(requestIp, res, sessionName, filename, sendToPlayer)
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
    var segmentVariation = 0

    if (isSegment) {
      var { number, variation } = hlsSession.parseSegmentFilename(file)
      segmentNumber = number
      segmentVariation = variation

      // Quality Changed
      if (segmentVariation !== hlsSession.currentJobQuality) {
        Logger.clearProgress()
        console.log('Quality option is different', hlsSession.currentJobQuality, segmentVariation)
        var isRestarted = await hlsSession.restart(segmentNumber, segmentVariation)
        if (!isRestarted) {
          return res.sendStatus(500)
        }
        var segmentLoaded = await hlsSession.waitForSegment(segmentNumber, filePath)
        if (!segmentLoaded) {
          Logger.error(`Segment ${segmentNumber} still not loaded`)
          return res.sendStatus(404)
        }
      }

      var distanceFromCurrentSegment = segmentNumber - hlsSession.currentSegment
      Logger.log('[REQUEST] Fetching segment', segmentNumber)
      if (distanceFromCurrentSegment === 10) {
        hlsSession.currentSegment++
      }
    } else {
      Logger.log('[REQUEST] Fetching playlist', filePath)
    }

    var fileExists = hlsSession.getIsSegmentCreated(segmentNumber, segmentVariation) || await fs.pathExists(filePath)
    if (!fileExists) {
      if (!isSegment) {
        Logger.error('[REQUEST] Playlist does not exist...', filePath)
        return res.sendStatus(400)
      }

      Logger.verbose('[REQUEST] Segment does not exist...', filePath)

      if (hlsSession.getShouldStartNewEncode(segmentNumber)) {
        var isRestarted = await hlsSession.restart(segmentNumber)
        if (!isRestarted) {
          return res.sendStatus(500)
        }
      }

      Logger.error(`Segment ${segmentNumber} still not loaded`)
      return res.sendStatus(404)
    }

    if (isSegment) {
      hlsSession.setSegmentFetched(segmentNumber)
    }

    res.sendFile(filePath, (err) => {
      if (err) {
        Logger.error('Oops failed to send file', err)
      }
    })
  }

  async openStream(requestIp, res, name, filename, sendToPlayer = false) {
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

    // Set this client with session
    this.clients[requestIp] = {
      id: requestIp,
      session: name
    }

    var encodingOptions = new EncodingOptions(fileInfo)
    var streamSession = new StreamSession(name, fileInfo, encodingOptions)
    this.sessions[name] = streamSession

    encodingOptions.numberOfSegments = await streamSession.generatePlaylist()
    streamSession.run()

    streamSession.on('close', () => {
      // Remove clients watching this session
      var sessionClients = Object.values(this.clients).filter(client => client.session === name).map(c => c.id)
      sessionClients.forEach((clientId) => {
        delete this.clients[clientId]
      })
      delete this.sessions[name]
    })

    if (sendToPlayer) {
      res.render('player', {
        title: 'Player',
        session: streamSession
      })
    } else {
      res.send(`Stream open: ${streamSession.url}`)
    }
  }
}
module.exports = MediaServer