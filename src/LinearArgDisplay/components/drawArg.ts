import {
  bpToScreenPx,
  forEachClippedBlock,
} from '@jbrowse/render-core/canvas2dUtils'

import { dendrogramPx } from './argTypes.ts'
import { timeAxisTicks, timeToY } from './timeAxis.ts'
import { layoutTreeCells } from './treeCells.ts'

import type { ArgRegionData } from '../../ArgRPC/rpcTypes.ts'
import type { ArgRenderState } from './argTypes.ts'
import type { Ctx2D } from '@jbrowse/core/util/paintLayer'
import type { RenderBlock } from '@jbrowse/render-core/renderBlock'

const GUTTER_PX = 2
const SPAN_STRIP_PX = 6
export const MUTATION_TICK_PX = 7

export interface ScreenCell {
  tree: number
  left: number
  width: number
  count: number
  /** where the drawn tree itself sits, which a sampled cell is wider than */
  treeLeft: number
  treeRight: number
}

/**
 * The trees of one block in screen pixels: the dendrogram cells, and the
 * trees too narrow for one, which draw as their TMRCA. The painters and the hit
 * test all read this, so what is drawn and what hovers cannot disagree.
 */
export function screenCells(
  data: ArgRegionData,
  block: RenderBlock,
  state: Pick<ArgRenderState, 'numSamples' | 'pxPerLeaf'>,
) {
  const { start, end, screenStartPx, screenEndPx, reversed } = block
  const toPx = (bp: number) =>
    bpToScreenPx(bp, start, end, screenStartPx, screenEndPx, reversed)
  const bpPerPx = (end - start) / Math.abs(screenEndPx - screenStartPx)
  const minWidthBp = dendrogramPx(state.numSamples, state.pxPerLeaf) * bpPerPx
  const { cells, collapsed } = layoutTreeCells(data, minWidthBp)
  return {
    toPx,
    collapsed,
    cells: cells.map(cell => {
      const a = toPx(cell.start)
      const b = toPx(cell.end)
      const c = toPx(data.treeStart[cell.tree]!)
      const d = toPx(data.treeEnd[cell.tree]!)
      return {
        tree: cell.tree,
        left: Math.min(a, b),
        width: Math.abs(b - a),
        count: cell.count,
        treeLeft: Math.min(c, d),
        treeRight: Math.max(c, d),
      }
    }),
  }
}

/**
 * The mutations on one cell's tree. Every edge of a tree packs after every edge
 * of the tree before it, so "carried by this tree or a later one" is monotone
 * over the mutation list even though mutations within a tree are in site order.
 */
export function mutationsOfCell(data: ArgRegionData, tree: number) {
  const lowerBound = (edge: number) => {
    let low = 0
    let high = data.mutationEdge.length
    while (low < high) {
      const mid = (low + high) >>> 1
      if (data.mutationEdge[mid]! < edge) {
        low = mid + 1
      } else {
        high = mid
      }
    }
    return low
  }
  return [
    lowerBound(data.edgeOffset[tree]!),
    lowerBound(data.edgeOffset[tree + 1]!),
  ] as const
}

/**
 * Where a mutation is drawn: on its branch's vertical limb, at the time it
 * happened, or halfway up the drawn branch where the file does not know.
 */
export function mutationPoint(
  data: ArgRegionData,
  cell: ScreenCell,
  mutation: number,
  y: (time: number) => number,
) {
  const edge = data.mutationEdge[mutation]!
  const time = data.mutationTime[mutation]!
  const bottom = y(data.childTime[edge]!)
  const top = y(data.parentTime[edge]!)
  return {
    x: cell.left + data.childX[edge]! * cell.width,
    y: Number.isNaN(time)
      ? (bottom + top) / 2
      : Math.min(bottom, Math.max(top, y(time))),
  }
}

function drawMutations(
  ctx: Ctx2D,
  data: ArgRegionData,
  cells: ScreenCell[],
  state: ArgRenderState,
  y: (time: number) => number,
) {
  const half = MUTATION_TICK_PX / 2
  ctx.beginPath()
  for (const cell of cells) {
    const [from, to] = mutationsOfCell(data, cell.tree)
    for (let m = from; m < to; m++) {
      const point = mutationPoint(data, cell, m, y)
      ctx.moveTo(point.x - half, point.y)
      ctx.lineTo(point.x + half, point.y)
    }
  }
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'white'
  ctx.lineWidth = 4.5
  ctx.stroke()
  ctx.strokeStyle = state.mutationColor
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.lineWidth = 1
  ctx.lineCap = 'butt'
}

/**
 * A faint cell behind each dendrogram, inset so neighbours are separated by a
 * gutter rather than sharing an edge. Adjacent trees differ only by the subtree
 * a recombination moved and are laid out on one leaf order, so without this
 * they read as a single continuous drawing.
 */
export function drawTreeCells(
  ctx: Ctx2D,
  regions: ReadonlyMap<number, ArgRegionData>,
  blocks: RenderBlock[],
  state: ArgRenderState,
) {
  const { canvasWidth, canvasHeight, treeCellColor } = state
  ctx.fillStyle = treeCellColor
  forEachClippedBlock(
    ctx,
    blocks,
    canvasWidth,
    canvasHeight,
    block => regions.get(block.displayedRegionIndex),
    (data, block) => {
      for (const { left, width } of screenCells(data, block, state).cells) {
        ctx.fillRect(left + GUTTER_PX, 0, width - 2 * GUTTER_PX, canvasHeight)
      }
    },
  )
}

/**
 * A cell standing in for several narrow trees gets a strip along its foot, pale
 * across the cell and dark over the drawn tree's own interval, so a sample never
 * passes for a tree that spans the whole cell. Painted over the leaves' feet.
 */
function drawSampleSpans(
  ctx: Ctx2D,
  cells: ScreenCell[],
  state: ArgRenderState,
) {
  const { canvasHeight, sampleSpanColor } = state
  const top = canvasHeight - SPAN_STRIP_PX
  for (const cell of cells) {
    if (cell.count > 1) {
      const left = cell.left + GUTTER_PX
      const right = cell.left + cell.width - GUTTER_PX
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillRect(left, top, right - left, SPAN_STRIP_PX)
      const from = Math.max(left, cell.treeLeft)
      const to = Math.min(right, cell.treeRight)
      ctx.fillStyle = sampleSpanColor
      ctx.fillRect(from, top, Math.max(1, to - from), SPAN_STRIP_PX)
    }
  }
}

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
 * Each cell draws one tree across the pixels of its stretch of genome, with the
 * nodes laid out normalized to that width. Trees too narrow for a cell of their
 * own collapse to a TMRCA step line, and a region the worker sent as a skyline
 * draws as nothing else.
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
    populationColors,
    highlightSamples,
    highlightColor,
  } = state
  const y = (time: number) => timeToY(time, maxTime, canvasHeight, timeScale)
  forEachClippedBlock(
    ctx,
    blocks,
    canvasWidth,
    canvasHeight,
    block => regions.get(block.displayedRegionIndex),
    (data, block) => {
      const { toPx, cells, collapsed } = screenCells(data, block, state)

      ctx.strokeStyle = skylineColor
      ctx.lineWidth = 1
      ctx.beginPath()
      let previous = -2
      for (const i of collapsed) {
        const from = toPx(data.treeStart[i]!)
        const top = y(data.tmrca[i]!)
        if (i === previous + 1) {
          ctx.lineTo(from, top)
        } else {
          ctx.moveTo(from, top)
        }
        ctx.lineTo(toPx(data.treeEnd[i]!), top)
        previous = i
      }
      ctx.stroke()

      // One stroke per color: switching strokeStyle mid-path would repaint
      // everything drawn so far in the new color.
      const buckets = new Map<string, [ScreenCell, number][]>()
      for (const cell of cells) {
        const to = data.edgeOffset[cell.tree + 1]!
        for (let j = data.edgeOffset[cell.tree]!; j < to; j++) {
          const pop = data.edgePop[j]!
          const color = (pop >= 0 && populationColors[pop]) || branchColor
          const bucket = buckets.get(color)
          if (bucket) {
            bucket.push([cell, j])
          } else {
            buckets.set(color, [[cell, j]])
          }
        }
      }
      const elbow = ({ left, width }: ScreenCell, j: number) => {
        const childX = left + data.childX[j]! * width
        const parentY = y(data.parentTime[j]!)
        ctx.moveTo(childX, y(data.childTime[j]!))
        ctx.lineTo(childX, parentY)
        ctx.lineTo(left + data.parentX[j]! * width, parentY)
      }
      for (const [color, edges] of buckets) {
        ctx.strokeStyle = color
        ctx.beginPath()
        for (const [cell, j] of edges) {
          elbow(cell, j)
        }
        ctx.stroke()
      }
      if (state.hoveredClade) {
        const { treeStart, node } = state.hoveredClade
        const cell = cells.find(c => data.treeStart[c.tree] === treeStart)
        if (cell) {
          // edges pack in preorder, so a parent is always met before its child
          const inClade = new Set([node])
          const clade = new Map<string, number[]>()
          const to = data.edgeOffset[cell.tree + 1]!
          for (let j = data.edgeOffset[cell.tree]!; j < to; j++) {
            const child = data.childNode[j]!
            if (child === node || inClade.has(data.parentNode[j]!)) {
              inClade.add(child)
              const pop = data.edgePop[j]!
              const color = (pop >= 0 && populationColors[pop]) || branchColor
              const bucket = clade.get(color)
              if (bucket) {
                bucket.push(j)
              } else {
                clade.set(color, [j])
              }
            }
          }
          ctx.lineWidth = 3
          ctx.lineJoin = 'round'
          for (const [color, edges] of clade) {
            ctx.strokeStyle = color
            ctx.beginPath()
            for (const j of edges) {
              elbow(cell, j)
            }
            ctx.stroke()
          }
          ctx.lineWidth = 1
          ctx.lineJoin = 'miter'
        }
      }
      if (state.showMutations) {
        drawMutations(ctx, data, cells, state, y)
      }
      drawSampleSpans(ctx, cells, state)

      // A traced sample's own branch, and the branches it first joins drawn
      // bold in their own colors: who a haplotype's nearest relatives are is
      // what changes along the genome, and a path to the root always ends at
      // the same place.
      if (highlightSamples.length > 0 && cells.length > 0) {
        const joined = new Map<string, [ScreenCell, number][]>()
        const own: [ScreenCell, number][] = []
        for (const cell of cells) {
          const to = data.edgeOffset[cell.tree + 1]!
          for (const sample of highlightSamples) {
            let parent = -1
            for (let j = data.edgeOffset[cell.tree]!; j < to; j++) {
              if (data.childNode[j] === sample) {
                parent = data.parentNode[j]!
                own.push([cell, j])
              }
            }
            for (let j = data.edgeOffset[cell.tree]!; j < to; j++) {
              if (
                data.parentNode[j] === parent &&
                data.childNode[j] !== sample
              ) {
                const pop = data.edgePop[j]!
                const color = (pop >= 0 && populationColors[pop]) || branchColor
                const bucket = joined.get(color)
                if (bucket) {
                  bucket.push([cell, j])
                } else {
                  joined.set(color, [[cell, j]])
                }
              }
            }
          }
        }
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        for (const [color, edges] of [
          ...joined,
          [highlightColor, own] as const,
        ]) {
          ctx.beginPath()
          for (const [cell, j] of edges) {
            elbow(cell, j)
          }
          ctx.strokeStyle = 'white'
          ctx.lineWidth = 6
          ctx.stroke()
          ctx.strokeStyle = color
          ctx.lineWidth = 3
          ctx.stroke()
        }
        ctx.lineWidth = 1
        ctx.lineJoin = 'miter'
        ctx.lineCap = 'butt'
      }
    },
  )
}
