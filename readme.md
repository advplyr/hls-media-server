# hls-media-server

Node server to transcode video files and stream on the fly via HLS.

#### Note: requires **[ffmpeg](http://ffmpeg.org)**

### What is the problem?
Streaming videos of any format on demand with seeking.

### How to achieve this?
Using FFmpeg and HTTP Live Streaming (HLS) protocol.


Generate the full `.m3u8` playlist immediately so the client behaves as if the entire video is ready to play. In order to make the playlist ahead of time we need to set a static segment length. When the client seeks to a portion of the video that has not been transcoded yet, we cancel the current job and start a new one.

## How it Works
1. Receive request to start stream session (`http://localhost:4000/stream/name-of-movie.mkv`)
2. Get metadata from video file using FFprobe
3. Use file metadata & client limitations to determine how the video will need to be transcoded (or if)
4. Generate & save `.m3u8` playlists using static segment length & file duration
5. Start the FFmpeg job of remuxing video to HLS
6. Listen for `.m3u8` and `.ts` requests from client player (HLS.js)


<img src="https://raw.githubusercontent.com/mcoop320/hls-media-server/master/terminal_seeking.png" />
Terminal displays which chunks of the video have been created by Ffmpeg and which have been fetched by client already. Green arrow is the segment being tracked as the "currentSegment" for the purpose of detecting when a seek has occurred.


## Usage

Clone this repo and create a `media` directory in root

Add some sample media files in there. [Get some samples here](https://filesamples.com/categories/video/)

```bash
npm run start
```

Go to `localhost:4000` to view a list of files and open a stream session.

#### Note: All sessions are closed and HLS files are deleted on SIGINT.


<img src="https://raw.githubusercontent.com/mcoop320/hls-media-server/master/terminal_full.png" />


## To Do

Get client player/device/limitations on open stream request.

Selecting best encoding options based on file and client capabilities.

See about direct play if possible.

Master playlist needs correct variation strings.

## Contributions

Would appreciate any help at all.

## License
[MIT](https://choosealicense.com/licenses/mit/)