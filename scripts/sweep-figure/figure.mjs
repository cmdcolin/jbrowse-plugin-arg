// Renders img/sweep.png: the simulated sweep on jb2/main, with callouts.
//
//   uv run --with msprime==1.4.4 python scripts/sweep-figure/simulate.py
//   pnpm build
//   node scripts/sweep-figure/figure.mjs

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

import {
  findChromeExecutable,
  jbrowseUrl,
  waitForJBrowseReady,
} from '@jbrowse/capture'
import { launch } from 'puppeteer'

const here = path.dirname(new URL(import.meta.url).pathname)
const root = path.join(here, '..', '..')
const PORT = 8899
const BASE = `http://localhost:${PORT}`
const INSTANCE =
  process.env.JBROWSE_INSTANCE ?? 'https://jbrowse.org/code/jb2/main/'
const PLUGIN_URL = `${BASE}/plugin/jbrowse-plugin-arg.umd.js`
const OUT = path.join(root, 'img', 'sweep.png')

const callouts = [
  {
    text: 'At the selected site, all 20 samples share one ancestor ~230 generations ago',
    bp: 1_014_000,
    time: 231,
    dx: 70,
    dy: 30,
  },
  {
    text: 'Elsewhere, their common ancestor lived ~10,000+ generations ago',
    bp: 400_000,
    time: 14_939,
    dx: -230,
    dy: 95,
  },
]

function serve() {
  const mounts = [
    ['/plugin/', path.join(root, 'dist')],
    ['/', here],
  ]
  return http
    .createServer((req, res) => {
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Private-Network': 'true',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
        'Accept-Ranges': 'bytes',
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, headers).end()
        return
      }
      const url = decodeURIComponent(new URL(req.url, BASE).pathname)
      const [prefix, dir] = mounts.find(([p]) => url.startsWith(p))
      const file = path.join(dir, url.slice(prefix.length))
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end()
        return
      }
      const size = fs.statSync(file).size
      headers['Content-Type'] = file.endsWith('.js')
        ? 'text/javascript'
        : file.endsWith('.json')
          ? 'application/json'
          : 'application/octet-stream'
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
      const start = range ? Number(range[1] || 0) : 0
      const end = range?.[2] ? Math.min(size - 1, Number(range[2])) : size - 1
      res.writeHead(range ? 206 : 200, {
        ...headers,
        'Content-Length': end - start + 1,
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
      })
      fs.createReadStream(file, { start, end }).pipe(res)
    })
    .listen(PORT)
}

function drawCallouts(items) {
  const RED = '#e3242b'
  const view = window.JBrowseSession.views[0]
  const display = view.tracks[0].displays[0]
  const container = document
    .querySelector('[data-testid^="trackRenderingContainer-"]')
    .getBoundingClientRect()
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute(
    'style',
    'position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;pointer-events:none',
  )
  svg.innerHTML = `<defs><marker id="head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="${RED}"/></marker></defs>`
  document.body.append(svg)
  for (const { text, bp, time, dx, dy } of items) {
    const { offsetPx } = view.bpToPx({ refName: 'chr1', coord: bp })
    const height = display.height
    const y =
      height - (Math.log1p(time) / Math.log1p(display.maxTime)) * (height - 3)
    const target = {
      x: container.left + offsetPx - view.offsetPx,
      y: container.top + y,
    }
    const pill = document.createElement('div')
    pill.textContent = text
    pill.setAttribute(
      'style',
      `position:fixed;z-index:99999;max-width:420px;padding:6px 12px;background:white;border:3px solid ${RED};border-radius:10px;font:600 17px/1.3 system-ui,sans-serif;color:#111`,
    )
    document.body.append(pill)
    const { width, height: h } = pill.getBoundingClientRect()
    const left = target.x + dx
    const top = target.y + dy - h / 2
    pill.style.left = `${left}px`
    pill.style.top = `${top}px`
    const tailX = Math.min(Math.max(target.x, left), left + width)
    const tailY = Math.min(Math.max(target.y, top), top + h)
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    const len = Math.hypot(target.x - tailX, target.y - tailY)
    const gap = 6 / len
    Object.entries({
      x1: tailX,
      y1: tailY,
      x2: target.x - (target.x - tailX) * gap,
      y2: target.y - (target.y - tailY) * gap,
      stroke: RED,
      'stroke-width': 4,
      'marker-end': 'url(#head)',
    }).forEach(([k, v]) => line.setAttribute(k, v))
    svg.append(line)
  }
}

const server = serve()
const browser = await launch({
  headless: true,
  executablePath: findChromeExecutable(),
  // a public https page may not fetch from localhost otherwise
  args: [
    '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests',
  ],
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1400, height: 520, deviceScaleFactor: 2 })
  await page.evaluateOnNewDocument(url => {
    localStorage.setItem('jbrowse-trusted-plugins', JSON.stringify([url]))
  }, PLUGIN_URL)
  await page.goto(
    jbrowseUrl({
      instance: INSTANCE,
      config: `${BASE}/config.json`,
      assembly: 'sim',
      loc: 'chr1:1-2,000,000',
      tracks: ['sweep'],
    }),
  )
  await waitForJBrowseReady(page, {
    assembly: 'sim',
    trackIds: ['sweep'],
    timeout: 90_000,
  })
  const error = await page.evaluate(
    () => document.querySelector('.MuiAlert-standardError')?.textContent,
  )
  if (error) {
    throw new Error(`the track shows an error: ${error}`)
  }
  await page.evaluate(drawCallouts, callouts)
  const clip = await page.evaluate(() => {
    const ruler = document
      .querySelector('[data-testid="rubberband_controls"]')
      .getBoundingClientRect()
    const tracks = document
      .querySelector('[data-testid="tracksContainer"]')
      .getBoundingClientRect()
    return {
      x: tracks.left,
      y: ruler.top,
      width: tracks.width,
      height: tracks.bottom - ruler.top,
    }
  })
  await page.screenshot({ path: OUT, clip })
  console.log('wrote', OUT)
} finally {
  await browser.close()
  server.close()
}
