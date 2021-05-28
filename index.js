require('dotenv').config()

if (!process.env.PORT || !process.env.MEDIA_PATH) {
  console.log('Missing .env file. Create a .env file and include PORT, MEDIA_PATH, OUTPUT_PATH, and LOG_LEVEL.')
  return
}

const MediaServer = require('./server/MediaServer')
new MediaServer()