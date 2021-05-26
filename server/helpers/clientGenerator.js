module.exports.session = (session) => {
  var qualityOptions = session.encodingOptions.qualityOptions
  var qualityBtns = ''
  var qualityBtnScript = ''
  var _index = qualityOptions.length - 1
  qualityOptions.forEach((quality) => {
    qualityBtns += `<button id="quality-${quality.name}">${quality.name} - ${_index}</button>`
    qualityBtnScript += `var btn${_index} = document.getElementById("quality-${quality.name}");btn${_index}.addEventListener('click', () => hls.currentLevel = ${_index});`
    _index--
  })
  return `
    <html>
      <head>
      <title>${session.name}</title>
        <script src="//cdn.jsdelivr.net/npm/hls.js@latest"></script>
      </head>
      <body>
        <h1 style="margin-bottom:4px;">Streaming session: ${session.name}</h1>
        <p style="margin-bottom:10px;">
        Video: <strong>${session.fileInfo.videoDescription}</strong> ===> <strong>${session.encodingOptions.encodeVideoDisplay}</strong><br />
        Audio: <strong>${session.fileInfo.audioDescription}</strong> ===> <strong>${session.encodingOptions.encodeAudioDisplay}</strong><br />
        </p>

        <div style="display:flex;align-items:center;justify-content:center;">
          <video id="video" controls style="max-width:90%" />
        </div>

        <p style="margin-top:10px;">
        File: ${session.fileInfo.filepath}<br />
        Stream: ${session.url}
        </p>
        ${qualityBtns}

        <script>
          if (Hls.isSupported()) {
            console.log('HLS is supported!');

            var video = document.getElementById('video');
            var hls = new Hls({ startLevel:2, debug: console });
            // bind them together
            hls.attachMedia(video);
            hls.on(Hls.Events.MEDIA_ATTACHED, function () {
              console.log('video and hls.js are now bound together !');
              hls.loadSource('${session.url}');
              hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
                console.log(
                  'manifest loaded, found ' + data.levels.length + ' quality level', data.levels
                );
                console.log('AutoLevelEnabled:', hls.autoLevelEnabled, 'First Level:', hls.firstLevel, hls.startLevel, hls.currentLevel)
                console.log('Bandwidth estimate', hls.bandwidthEstimate)
                // hls.currentLevel = 2
                video.play()
              });

              hls.on(Hls.Events.ERROR, function (event, data) {
                if (data.fatal) {
                  switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                      // try to recover network error
                      console.log('fatal network error encountered, try to recover');
                      hls.startLoad();
                      break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                      console.log('fatal media error encountered, try to recover');
                      hls.recoverMediaError();
                      break;
                    default:
                      // cannot recover
                      hls.destroy();
                      break;
                  }
                }
              });
            });

           ${qualityBtnScript}
          }
        </script>
      </body>
    </html>
  `
}

module.exports.media = (files, mediaDir) => {

  var fileLines = []
  files.forEach((file) => {
    fileLines.push(`
      <div style="padding:2px 0px;">
        <a href="/stream/${file}">${file}</a>
      </div>
    `)
  })

  var filesHtml = fileLines.length ? fileLines.join('') : `<p>Oops, there are no files in the media folder:<br><strong>${mediaDir}</strong></p>`

  return `
    <html>
      <head>
      <title>Media Files</title>
        <script src="//cdn.jsdelivr.net/npm/hls.js@latest"></script>
      </head>
      <body>
        <h2 style="margin-bottom:4px;">Media Files</h2>
        ${filesHtml}
      </body>
    </html>
  `
}