import { clampBlockScissor } from '@jbrowse/render-core/canvas2dUtils'

import {
  MUTATION_TICK_PX,
  mutationPoint,
  mutationsOfCell,
  screenCells,
} from './drawArg.ts'
import { timeToY } from './timeAxis.ts'

import type { ArgRegionData } from '../../ArgRPC/rpcTypes.ts'
import type { ArgRenderState } from './argTypes.ts'
import type { RenderBlock } from '@jbrowse/render-core/renderBlock'

export interface ArgBranch {
  node: number
  time: number
  leafCount: number
  populationName: string | undefined
}

export interface ArgMutation {
  position: number
  allele: string
  /** undefined where the file does not record when it happened */
  time: number | undefined
  /** canvas x of the site's genomic position, for a guide down to it */
  siteX: number
}

/**
 * What the cursor is over: always a local tree, and the branch within it when
 * the tree was wide enough to be drawn as a dendrogram.
 */
export interface ArgHit {
  treeStart: number
  treeEnd: number
  tmrca: number
  /** trees in the column this tree was drawn to stand for */
  treesInCell: number
  branch: ArgBranch | undefined
  mutation?: ArgMutation
}

export function sameArgHit(a: ArgHit, b: ArgHit) {
  return (
    a.treeStart === b.treeStart &&
    a.treeEnd === b.treeEnd &&
    a.branch?.node === b.branch?.node &&
    a.mutation?.position === b.mutation?.position &&
    a.mutation?.allele === b.mutation?.allele
  )
}

export const ARG_HIT_RADIUS_PX = 4

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy
  const along =
    lengthSq === 0
      ? 0
      : Math.min(1, Math.max(0, ((px - x1) * dx + (py - y1) * dy) / lengthSq))
  return Math.hypot(px - (x1 + along * dx), py - (y1 + along * dy))
}

/**
 * Sample leaves below the child of `edge`, by rebuilding the local tree's
 * topology from its own edges: a node with no edge hanging off it is a leaf.
 */
function leavesBelow(
  data: ArgRegionData,
  from: number,
  to: number,
  edge: number,
) {
  const below = new Map<number, number[]>()
  for (let j = from; j < to; j++) {
    const key = data.parentNode[j]!
    const siblings = below.get(key)
    if (siblings) {
      siblings.push(j)
    } else {
      below.set(key, [j])
    }
  }
  let leaves = 0
  const pending = [edge]
  while (pending.length > 0) {
    const j = pending.pop()!
    const children = below.get(data.childNode[j]!)
    if (children) {
      pending.push(...children)
    } else {
      leaves++
    }
  }
  return leaves
}

interface Candidate {
  data: ArgRegionData
  tree: number
  edge: number | undefined
  count: number
  mutation?: ArgMutation
}

function toHit({ data, tree, edge, count, mutation }: Candidate): ArgHit {
  const shared = {
    mutation,
    treesInCell: count,
    treeStart: data.treeStart[tree]!,
    treeEnd: data.treeEnd[tree]!,
    tmrca: data.tmrca[tree]!,
  }
  if (edge === undefined) {
    return { ...shared, branch: undefined }
  }
  const population = data.edgePop[edge]!
  return {
    ...shared,
    branch: {
      node: data.childNode[edge]!,
      time: data.childTime[edge]!,
      leafCount: leavesBelow(
        data,
        data.edgeOffset[tree]!,
        data.edgeOffset[tree + 1]!,
        edge,
      ),
      populationName:
        population >= 0 ? data.populationNames[population] : undefined,
    },
  }
}

/**
 * The branch under the cursor, in the same coordinates `drawArgBlocks` paints
 * in: a tree occupies the pixels of its genomic interval, a node sits at
 * `left + x * width`, and an edge is the elbow from the child up to the
 * parent's time and across to the parent. A tree too narrow for a dendrogram
 * was drawn as its TMRCA, and hits as the tree alone.
 */
export function findArgHit(
  mouseX: number,
  mouseY: number,
  blocks: RenderBlock[],
  regions: ReadonlyMap<number, ArgRegionData>,
  state: ArgRenderState,
) {
  const { canvasWidth, canvasHeight, maxTime, timeScale } = state
  const toY = (time: number) => timeToY(time, maxTime, canvasHeight, timeScale)
  const near = (left: number, width: number) =>
    mouseX >= left - ARG_HIT_RADIUS_PX &&
    mouseX <= left + width + ARG_HIT_RADIUS_PX
  let best: Candidate | undefined
  let bestDistance = ARG_HIT_RADIUS_PX
  for (const block of blocks) {
    const data = regions.get(block.displayedRegionIndex)
    const clip = clampBlockScissor(
      block.screenStartPx,
      block.screenEndPx,
      canvasWidth,
    )
    if (
      data !== undefined &&
      clip &&
      mouseX >= clip.scissorX &&
      mouseX < clip.scissorX + clip.scissorW
    ) {
      const { toPx, cells, collapsed } = screenCells(data, block, state)
      for (const cell of cells) {
        const { tree, left, width, count } = cell
        if (!near(left, width)) {
          continue
        }
        if (state.showMutations) {
          const [from, to] = mutationsOfCell(data, tree)
          for (let m = from; m < to; m++) {
            const point = mutationPoint(data, cell, m, toY)
            const distance = Math.max(
              Math.abs(mouseX - point.x) - MUTATION_TICK_PX / 2,
              Math.abs(mouseY - point.y),
              0,
            )
            if (distance <= bestDistance) {
              bestDistance = distance
              const time = data.mutationTime[m]!
              best = {
                data,
                tree,
                edge: data.mutationEdge[m]!,
                count,
                mutation: {
                  position: data.mutationPosition[m]!,
                  allele: data.mutationAllele[m]!,
                  time: Number.isNaN(time) ? undefined : time,
                  siteX: toPx(data.mutationPosition[m]!),
                },
              }
            }
          }
        }
        const to = data.edgeOffset[tree + 1]!
        for (let j = data.edgeOffset[tree]!; j < to; j++) {
          const childX = left + data.childX[j]! * width
          const parentY = toY(data.parentTime[j]!)
          const distance = Math.min(
            distanceToSegment(
              mouseX,
              mouseY,
              childX,
              toY(data.childTime[j]!),
              childX,
              parentY,
            ),
            distanceToSegment(
              mouseX,
              mouseY,
              childX,
              parentY,
              left + data.parentX[j]! * width,
              parentY,
            ),
          )
          if (distance < bestDistance) {
            bestDistance = distance
            best = { data, tree, edge: j, count }
          }
        }
      }
      for (const tree of collapsed) {
        const a = toPx(data.treeStart[tree]!)
        const b = toPx(data.treeEnd[tree]!)
        const left = Math.min(a, b)
        const width = Math.abs(b - a)
        if (near(left, width)) {
          const top = toY(data.tmrca[tree]!)
          const distance = distanceToSegment(
            mouseX,
            mouseY,
            left,
            top,
            left + width,
            top,
          )
          if (distance < bestDistance) {
            bestDistance = distance
            best = { data, tree, edge: undefined, count: 1 }
          }
        }
      }
    }
  }
  return best === undefined ? undefined : toHit(best)
}
