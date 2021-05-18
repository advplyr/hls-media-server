# hls-media-server

Node server to transcode video files and stream on the fly via HLS.

## Requires

**[ffmpeg](http://ffmpeg.org)**

## Usage

Create a directory inside the project root named `media`

Add some sample media files there. [Get some samples here](https://filesamples.com/categories/video/)

```bash
cd hls-media-server

npm run start
```

Go to `localhost:4000` to view a list of files and click to open a streaming session.

Note: All sessions are closed and HLS files are deleted on SIGINT.

## To Do
Selecting best encoding options based on file and client capabilities.

## License
[MIT](https://choosealicense.com/licenses/mit/)