import path from 'node:path'

import type { Annotation } from '@jbrowse/browser-test-utils/annotationOverlay'

const components =
  process.env.JBROWSE_COMPONENTS ?? '/home/cdiesh/src/jbrowse-components'
const { openJBrowse } = await import(
  path.join(components, 'products/jbrowse-capture/esm/index.js')
)
const { drawAnnotations } = await import(
  path.join(components, 'website/scripts/annotations.ts')
)

const BASE = 'http://localhost:8899'
const here = path.dirname(new URL(import.meta.url).pathname)

interface Story {
  name: string
  track: string
  loc: string
  width?: number
  annotations: Annotation[]
}

const stories: Story[] = [
  {
    name: 'split',
    track: 'split',
    loc: 'chr1:1-1,000,000',
    annotations: [
      {
        type: 'text',
        fontSize: 18,
        leader: true,
        text: 'In every tree, blue and orange first meet at the very top',
        anchor: { track: 'split', locus: 'chr1:590,000', fracY: 0.02 },
        dx: 60,
        dy: -40,
      },
      {
        type: 'text',
        fontSize: 18,
        leader: true,
        text: 'Below that, A only coalesces with A, and B with B',
        anchor: { track: 'split', locus: 'chr1:880,000', fracY: 0.45 },
        dx: -40,
        dy: 70,
        textAlign: 'end',
      },
    ],
  },
  {
    name: 'introgression',
    track: 'introgression',
    loc: 'chr1:420,000-860,000',
    width: 1800,
    annotations: [
      {
        type: 'box',
        anchor: { track: 'introgression', locus: 'chr1:544,449-726,806' },
        strokeWidth: 3,
      },
      {
        type: 'text',
        fontSize: 18,
        leader: true,
        text: 'Inside the box, the red A haplotype groups with orange B: this stretch of its DNA came from B',
        anchor: { track: 'introgression', locus: 'chr1:560,000', fracY: 0.3 },
        dx: -60,
        dy: 60,
        maxWidth: 420,
      },
      {
        type: 'text',
        fontSize: 18,
        leader: true,
        text: 'Outside it, the same haplotype groups with blue A',
        anchor: { track: 'introgression', locus: 'chr1:840,000', fracY: 0.3 },
        dx: 60,
        dy: 60,
        maxWidth: 320,
      },
    ],
  },
  {
    name: 'sweep',
    track: 'sweep',
    loc: 'chr1:1-2,000,000',
    annotations: [
      {
        type: 'text',
        fontSize: 18,
        leader: true,
        text: 'At the selected site every sample shares one ancestor ~230 generations ago',
        anchor: { track: 'sweep', locus: 'chr1:1,014,000', fracY: 0.45 },
        dx: 60,
        dy: 40,
        maxWidth: 380,
      },
      {
        type: 'text',
        fontSize: 18,
        leader: true,
        text: 'Elsewhere the common ancestor is ~10,000+ generations back',
        anchor: { track: 'sweep', locus: 'chr1:400,000', fracY: 0.2 },
        dx: 40,
        dy: 70,
        maxWidth: 380,
      },
    ],
  },
]

const only = process.argv[2]
for (const story of stories.filter(s => !only || s.name === only)) {
  const width = story.width ?? 1400
  const { browser, page } = await openJBrowse({
    instance: `${BASE}/`,
    config: `${BASE}/stories/config.json`,
    assembly: 'sim',
    loc: story.loc,
    tracks: [story.track],
    width,
    height: 520,
    scale: 2,
  })
  try {
    await drawAnnotations(page, story.annotations)
    const out = path.join(here, 'out', `${story.name}.png`)
    const clip = await page.evaluate(() => {
      const ruler = document
        .querySelector('[data-testid="rubberband_controls"]')!
        .getBoundingClientRect()
      const tracks = document
        .querySelector('[data-testid="tracksContainer"]')!
        .getBoundingClientRect()
      return {
        x: tracks.left,
        y: ruler.top,
        width: tracks.width,
        height: tracks.bottom - ruler.top,
      }
    })
    await page.screenshot({ path: out, clip })
    console.log('wrote', out)
  } finally {
    await browser.close()
  }
}
