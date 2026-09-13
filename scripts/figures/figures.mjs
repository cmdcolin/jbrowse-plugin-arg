// Renders the README and docs images with the local build of the plugin.
//
//   uv run --with msprime==1.4.4 python scripts/figures/simulate_sweep.py
//   pnpm build
//   node scripts/figures/figures.mjs [name...]
//
// A localhost server hands the browser dist/ as the plugin, the simulated sweep
// from scripts/figures/, and the hosted demo config rewritten to name that
// plugin, so every figure renders this checkout rather than a published build.

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
const INSTANCE =
  process.env.JBROWSE_INSTANCE ?? 'https://jbrowse.org/code/jb2/main/'
const DEMO = 'https://jbrowse.org/demos/arg/config.json'
const PORT = 8899
const BASE = `http://localhost:${PORT}`
const BUNDLE = 'jbrowse-plugin-arg.umd.js'
const PLUGIN_URL = `${BASE}/plugin/${BUNDLE}`

const figures = [
  {
    name: 'sweep',
    config: `${BASE}/sim.config.json`,
    assembly: 'sim',
    loc: 'chr1:1-2,000,000',
    tracks: ['sweep'],
    callouts: [
      {
        text: 'At the selected site, all 20 samples share one ancestor ~230 generations ago',
        track: 'sweep',
        bp: 1_014_000,
        time: 231,
        dx: 70,
        dy: 30,
      },
      {
        text: 'Elsewhere, their common ancestor lived ~10,000+ generations ago',
        track: 'sweep',
        bp: 400_000,
        time: 14_939,
        dx: -230,
        dy: 95,
      },
    ],
  },
  {
    name: 'introgression',
    config: `${BASE}/sim.config.json`,
    assembly: 'sim',
    loc: 'chr1:1-1,200,000',
    tracks: ['introgression_painting'],
    height: 560,
    callouts: [
      {
        text: 'Here A6 carries DNA from population B',
        track: 'introgression_painting',
        bp: 640_000,
        row: 'A A6',
        dx: 160,
        dy: 45,
      },
      {
        text: "B6 and B3 light up there too: their closest relative is A6's imported copy",
        track: 'introgression_painting',
        bp: 700_000,
        row: 'B B6',
        dx: 60,
        dy: -60,
      },
    ],
  },
  {
    name: 'prnp',
    config: `${BASE}/demo.config.json`,
    assembly: 'hg38',
    loc: 'chr20:4,689,000-4,693,000',
    tracks: ['genes', 'prnp_arg', 'prnp_variants'],
    height: 1000,
  },
  {
    name: 'prnp-mutation',
    config: `${BASE}/demo.config.json`,
    assembly: 'hg38',
    loc: 'chr20:4,689,000-4,693,000',
    tracks: ['genes', 'prnp_arg', 'prnp_variants'],
    height: 1000,
    hoverMutation: 'prnp_arg',
  },
  {
    name: 'prnp-skyline',
    config: `${BASE}/demo.config.json`,
    assembly: 'hg38',
    loc: 'chr20:4,200,000-5,200,000',
    tracks: ['genes', 'prnp_arg'],
    height: 800,
  },
  {
    name: 'trees',
    config: `${BASE}/demo.config.json`,
    assembly: 'hg38',
    loc: 'chr20:1,900,000-1,920,000',
    tracks: ['genes', 'chr20_arg'],
    height: 1000,
  },
  {
    name: 'mixed',
    config: `${BASE}/demo.config.json`,
    assembly: 'hg38',
    loc: 'chr20:1,850,000-2,050,000',
    tracks: ['genes', 'chr20_arg'],
    height: 1000,
  },
  {
    name: 'skyline',
    config: `${BASE}/demo.config.json`,
    assembly: 'hg38',
    loc: 'chr20:1,000,000-11,000,000',
    tracks: ['genes', 'chr20_arg'],
    height: 1000,
  },
]

const TYPES = { '.json': 'application/json', '.js': 'text/javascript' }

async function serve() {
  const demo = await (await fetch(DEMO)).json()
  for (const plugin of demo.plugins) {
    if (plugin.name === 'Arg') {
      delete plugin.url
      plugin.umdUrl = PLUGIN_URL
    }
  }
  const generated = { '/demo.config.json': JSON.stringify(demo) }
  const server = http.createServer((req, res) => {
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
    if (generated[url]) {
      res.writeHead(200, { ...headers, 'Content-Type': TYPES['.json'] })
      res.end(generated[url])
      return
    }
    const file =
      url === `/plugin/${BUNDLE}`
        ? path.join(root, 'dist', BUNDLE)
        : path.join(here, url)
    if (
      !file.startsWith(root) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      res.writeHead(404, headers).end()
      return
    }
    const size = fs.statSync(file).size
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
    const start = range ? Number(range[1] || 0) : 0
    const end = range?.[2] ? Math.min(size - 1, Number(range[2])) : size - 1
    res.writeHead(range ? 206 : 200, {
      ...headers,
      'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Content-Length': end - start + 1,
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
    })
    fs.createReadStream(file, { start, end }).pipe(res)
  })
  await new Promise(resolve => server.listen(PORT, resolve))
  return server
}

function drawCallouts(items) {
  const RED = '#e3242b'
  const view = window.JBrowseSession.views[0]
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute(
    'style',
    'position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;pointer-events:none',
  )
  svg.innerHTML = `<defs><marker id="head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="${RED}"/></marker></defs>`
  document.body.append(svg)
  for (const { text, track, bp, time, row, dx, dy } of items) {
    const display = view.tracks.find(t => t.configuration.trackId === track)
      .displays[0]
    const container = document
      .querySelector(
        `[data-testid$="-${track}"][data-testid^="trackRenderingContainer-"]`,
      )
      .getBoundingClientRect()
    const { offsetPx } = view.bpToPx({
      refName: view.displayedRegions[0].refName,
      coord: bp,
    })
    const { height } = display
    // a painting row is named by its partition value; a tree height by time
    const y =
      row === undefined
        ? height -
          (Math.log1p(time) / Math.log1p(display.maxTime)) * (height - 3)
        : (display.rowIndexByValue.get(row) + 0.5) * display.effectiveRowHeight
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
    const gap = 6 / Math.hypot(target.x - tailX, target.y - tailY)
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    for (const [key, value] of Object.entries({
      x1: tailX,
      y1: tailY,
      x2: target.x - (target.x - tailX) * gap,
      y2: target.y - (target.y - tailY) * gap,
      stroke: RED,
      'stroke-width': 4,
      'marker-end': 'url(#head)',
    })) {
      line.setAttribute(key, value)
    }
    svg.append(line)
  }
}

// Asks the display's own hit test where its mutations are, so the pointer lands
// on a drawn tick without this script restating the layout. Takes one carried
// by about ten samples: a clade you can see, not a near-root split.
async function hoverMutation(page, track) {
  const target = await page.evaluate(trackId => {
    const view = window.JBrowseSession.views[0]
    const display = view.tracks.find(t => t.configuration.trackId === trackId)
      .displays[0]
    const rect = document
      .querySelector(
        `[data-testid$="-${trackId}"][data-testid^="trackRenderingContainer-"]`,
      )
      .getBoundingClientRect()
    let best
    for (let x = 0; x < rect.width; x += 2) {
      for (let y = 0; y < display.height; y += 2) {
        const hit = display.argHitAt(x, y)
        if (
          hit?.mutation &&
          hit.mutation.siteX > 0 &&
          hit.mutation.siteX < rect.width &&
          (!best ||
            Math.abs(hit.branch.leafCount - 10) <
              Math.abs(best.hit.branch.leafCount - 10))
        ) {
          best = { hit, x, y }
        }
      }
    }
    return best && { x: rect.left + best.x, y: rect.top + best.y }
  }, track)
  if (!target) {
    throw new Error(`no mutation found to hover on ${track}`)
  }
  await page.mouse.move(target.x, target.y)
  await page.waitForSelector('[data-testid="arg-mutation-guide"]')
}

async function render(browser, figure) {
  const page = await browser.newPage()
  const pluginRequests = []
  page.on('request', req => {
    if (req.url() === PLUGIN_URL) {
      pluginRequests.push(req.url())
    }
  })
  try {
    await page.setViewport({
      width: figure.width ?? 1400,
      height: figure.height ?? 520,
      deviceScaleFactor: 2,
    })
    await page.evaluateOnNewDocument(url => {
      localStorage.setItem('jbrowse-trusted-plugins', JSON.stringify([url]))
    }, PLUGIN_URL)
    await page.goto(
      jbrowseUrl({
        instance: INSTANCE,
        config: figure.config,
        assembly: figure.assembly,
        loc: figure.loc,
        tracks: figure.tracks,
      }),
    )
    await waitForJBrowseReady(page, {
      assembly: figure.assembly,
      trackIds: figure.tracks,
      timeout: 120_000,
    })
    const error = await page.evaluate(
      () => document.querySelector('[role="alert"]')?.textContent,
    )
    if (error) {
      throw new Error(`${figure.name}: a track shows an error: ${error}`)
    }
    if (figure.hoverMutation) {
      await hoverMutation(page, figure.hoverMutation)
    }
    if (figure.callouts) {
      await page.evaluate(drawCallouts, figure.callouts)
    }
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
        height: Math.min(tracks.bottom, window.innerHeight) - ruler.top,
      }
    })
    const out = path.join(root, 'img', `${figure.name}.png`)
    await page.screenshot(
      process.env.FULL_PAGE
        ? { path: out }
        : { path: out, clip, captureBeyondViewport: false },
    )
    console.log('wrote', out, `(plugin requests: ${pluginRequests.length})`)
  } finally {
    await page.close()
  }
}

const only = process.argv.slice(2)
const server = await serve()
const browser = await launch({
  headless: true,
  executablePath: findChromeExecutable(),
  // jbrowse.org pages may not fetch from localhost otherwise
  args: [
    '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests',
  ],
})
try {
  for (const figure of figures) {
    if (only.length === 0 || only.includes(figure.name)) {
      await render(browser, figure)
    }
  }
} finally {
  await browser.close()
  server.close()
}
