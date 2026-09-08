import {
  bpToScreenPx,
  forEachClippedBlock,
} from '@jbrowse/render-core/canvas2dUtils'

import { timeAxisTicks, timeToY } from './timeAxis.ts'

import type { ArgRegionData } from '../../ArgRPC/rpcTypes.ts'
import type { ArgRenderState } from './argTypes.ts'
import type { Ctx2D } from '@jbrowse/core/util/paintLayer'
import type { RenderBlock } from '@jbrowse/render-core/renderBlock'

export function drawTimeGridlines(ctx: Ctx2D, state: ArgRenderState) {
  const { canvasWidth, canvasHeight, maxTime, timeScale, gridlineColor } = state
  ctx.strokeStyle = gridlineColor
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const tick of timeAxisTicks(maxTime, canvasHeight, timeScale)) {
    const y = Math.round(tick.y) + 0.5
    ctx.moveTo(0, y)
    ctx.lineTo(canvasWidth, y)
  }
  ctx.stroke()
}

/**
 * Paint the local trees of every visible block.
 *
 * A tree occupies the pixels its genomic interval occupies, and its nodes were
 * laid out normalized to that interval, so the whole ARG reads as a row of
 * dendrograms that get narrower as recombination breaks them up. Trees too
 * narrow to show topology collapse to a TMRCA tick, and a region the worker
 * decided to send as a skyline draws as one TMRCA line.
 */
export function drawArgBlocks(
  ctx: Ctx2D,
  regions: ReadonlyMap<number, ArgRegionData>,
  blocks: RenderBlock[],
  state: ArgRenderState,
) {
  const {
    canvasWidth,
    canvasHeight,
    maxTime,
    timeScale,
    branchColor,
    skylineColor,
    pxPerLeaf,
    numSamples,
  } = state
  const dendrogramPx = Math.max(2, numSamples * pxPerLeaf)
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
      const y = (time: number) =>
        timeToY(time, maxTime, canvasHeight, timeScale)

      // A tree too narrow to separate its leaves is drawn as the one thing
      // that still reads at that width: the height its root coalesces at. The
      // segments join into one step line, so a run of sub-pixel trees is a
      // continuous skyline rather than a row of dashes with gaps between them.
      ctx.strokeStyle = skylineColor
      ctx.lineWidth = 1
      ctx.beginPath()
      let joined = false
      let dendrograms = 0
      for (let i = 0; i < data.numTrees; i++) {
        if (data.edgeCount[i] === 0) {
          joined = false
          continue
        }
        const from = toPx(data.treeStart[i]!)
        const to = toPx(data.treeEnd[i]!)
        if (data.detail === 'trees' && Math.abs(to - from) >= dendrogramPx) {
          dendrograms++
          joined = false
          continue
        }
        const top = y(data.tmrca[i]!)
        if (joined) {
          ctx.lineTo(from, top)
        } else {
          ctx.moveTo(from, top)
          joined = true
        }
        ctx.lineTo(to, top)
      }
      ctx.stroke()
      if (dendrograms === 0) {
        return
      }

      ctx.strokeStyle = branchColor
      ctx.beginPath()
      for (let i = 0; i < data.numTrees; i++) {
        const a = toPx(data.treeStart[i]!)
        const b = toPx(data.treeEnd[i]!)
        const left = Math.min(a, b)
        const width = Math.abs(b - a)
        if (width < dendrogramPx) {
          continue
        }
        const from = data.edgeOffset[i]!
        const to = data.edgeOffset[i + 1]!
        for (let j = from; j < to; j++) {
          const childX = left + data.childX[j]! * width
          const parentX = left + data.parentX[j]! * width
          const parentY = y(data.parentTime[j]!)
          ctx.moveTo(childX, y(data.childTime[j]!))
          ctx.lineTo(childX, parentY)
          ctx.lineTo(parentX, parentY)
        }
      }
      ctx.stroke()
    },
  )
}
