import {
  bpToScreenPx,
  forEachClippedBlock,
} from '@jbrowse/render-core/canvas2dUtils'

import type { ArgRegionData } from '../../ArgRPC/rpcTypes.ts'
import type { ArgRenderState } from './argTypes.ts'
import type { Ctx2D } from '@jbrowse/core/util/paintLayer'
import type { RenderBlock } from '@jbrowse/render-core/renderBlock'

/** opacity steps a share is rounded to, so fills batch by color */
const SHARE_STEPS = 4

/**
 * `#rgb` or `#rrggbb` at an opacity. The context may be an SVG one, which has
 * no globalAlpha, so the opacity rides in the color; a named color stays
 * opaque.
 */
function withAlpha(color: string, alpha: number) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1]
  if (!hex) {
    return color
  }
  const full =
    hex.length === 3 ? [...hex].map(digit => digit + digit).join('') : hex
  const [r, g, b] = [0, 2, 4].map(i =>
    Number.parseInt(full.slice(i, i + 2), 16),
  )
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`
}

export function paintingRowHeight(state: ArgRenderState) {
  return state.canvasHeight / Math.max(1, state.numSamples)
}

/** the color a population rank paints in, or the branch color without one */
export function rankColor(
  data: ArgRegionData,
  state: ArgRenderState,
  rank: number,
) {
  return (
    state.populationColors[data.samplePopulations[rank]!] ?? state.branchColor
  )
}

/**
 * One row per haplotype, one column per local tree (or skyline bin), each cell
 * the color of the population that haplotype's nearest relatives belong to
 * there, more opaque the more of them do.
 */
export function drawPainting(
  ctx: Ctx2D,
  regions: ReadonlyMap<number, ArgRegionData>,
  blocks: RenderBlock[],
  state: ArgRenderState,
) {
  const { canvasWidth, canvasHeight } = state
  const rowHeight = paintingRowHeight(state)
  forEachClippedBlock(
    ctx,
    blocks,
    canvasWidth,
    canvasHeight,
    block => regions.get(block.displayedRegionIndex),
    (data, block) => {
      const { start, end, screenStartPx, screenEndPx, reversed } = block
      const toPx = (bp: number) =>
        bpToScreenPx(bp, start, end, screenStartPx, screenEndPx, reversed)
      const numSamples = data.numSamples
      if (data.paintPopulation.length === 0) {
        return
      }
      const fills = new Map<string, number[]>()
      for (let i = 0; i < data.numTrees; i++) {
        if (data.edgeCount[i] === 0) {
          continue
        }
        const a = toPx(data.treeStart[i]!)
        const b = toPx(data.treeEnd[i]!)
        const left = Math.min(a, b)
        const width = Math.max(0.5, Math.abs(b - a))
        for (let row = 0; row < numSamples; row++) {
          const sample = data.sampleRows[row]!
          const rank = data.paintPopulation[i * numSamples + sample]!
          if (rank >= 0) {
            const step = Math.max(
              1,
              Math.round(
                (data.paintShare[i * numSamples + sample]! / 255) * SHARE_STEPS,
              ),
            )
            const key = `${rankColor(data, state, rank)}|${step}`
            const rects = fills.get(key)
            if (rects) {
              rects.push(left, row * rowHeight, width)
            } else {
              fills.set(key, [left, row * rowHeight, width])
            }
          }
        }
      }
      for (const [key, rects] of fills) {
        const [color, step] = key.split('|')
        ctx.fillStyle = withAlpha(
          color!,
          0.2 + (0.8 * Number(step)) / SHARE_STEPS,
        )
        for (let k = 0; k < rects.length; k += 3) {
          ctx.fillRect(rects[k]!, rects[k + 1]!, rects[k + 2]!, rowHeight)
        }
      }
    },
  )
}

/** the painting cell under a point: which tree column and which sample row */
export function paintingCellAt(
  data: ArgRegionData,
  block: RenderBlock,
  state: ArgRenderState,
  mouseX: number,
  mouseY: number,
) {
  const row = Math.floor(mouseY / paintingRowHeight(state))
  if (row < 0 || row >= data.numSamples || data.paintPopulation.length === 0) {
    return undefined
  }
  const { start, end, screenStartPx, screenEndPx, reversed } = block
  const toPx = (bp: number) =>
    bpToScreenPx(bp, start, end, screenStartPx, screenEndPx, reversed)
  let low = 0
  let high = data.numTrees - 1
  while (low <= high) {
    const mid = (low + high) >>> 1
    const a = toPx(data.treeStart[mid]!)
    const b = toPx(data.treeEnd[mid]!)
    if (mouseX < Math.min(a, b)) {
      if (reversed) {
        low = mid + 1
      } else {
        high = mid - 1
      }
    } else if (mouseX >= Math.max(a, b)) {
      if (reversed) {
        high = mid - 1
      } else {
        low = mid + 1
      }
    } else {
      return data.edgeCount[mid] === 0
        ? undefined
        : { tree: mid, sample: data.sampleRows[row]! }
    }
  }
  return undefined
}
