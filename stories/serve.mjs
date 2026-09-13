import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const port = Number(process.env.PORT ?? 8899)
const mounts = [
  ['/plugin/', path.join(here, '..', 'dist')],
  ['/stories/', here],
  [
    '/',
    process.env.JBROWSE_WEB ??
      '/home/cdiesh/src/jbrowse-components/products/jbrowse-web/build',
  ],
]
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const [prefix, root] = mounts.find(([p]) => url.startsWith(p))
    let file = path.join(root, url.slice(prefix.length))
    if (
      url === '/' ||
      !fs.existsSync(file) ||
      fs.statSync(file).isDirectory()
    ) {
      file =
        fs.existsSync(file) && fs.statSync(file).isFile()
          ? file
          : path.join(root, 'index.html')
    }
    if (!fs.existsSync(file)) {
      res.writeHead(404).end()
      return
    }
    const size = fs.statSync(file).size
    const headers = {
      'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    }
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
    if (range) {
      const start = Number(range[1] || 0)
      const end = Math.min(size - 1, range[2] ? Number(range[2]) : size - 1)
      res.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': end - start + 1,
      })
      fs.createReadStream(file, { start, end }).pipe(res)
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': size })
      fs.createReadStream(file).pipe(res)
    }
  })
  .listen(port, () => console.log(`http://localhost:${port}`))
