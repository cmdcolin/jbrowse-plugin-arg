import {
  bpAtPxExact,
  bpToScreenPx,
  clampBlockScissor,
} from '@jbrowse/render-core/canvas2dUtils'

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

/**
 * What the cursor is over: always a local tree, and the branch within it when
 * the tree was wide enough to be drawn as a dendrogram.
 */
export interface ArgHit {
  treeStart: number
  treeEnd: number
  tmrca: number
  branch: ArgBranch | undefined
}

export function sameArgHit(a: ArgHit, b: ArgHit) {
  return (
    a.treeStart === b.treeStart &&
    a.treeEnd === b.treeEnd &&
    a.branch?.node === b.branch?.node
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
      : Math.min(
          1,
          Math.max(0, ((px - x1) * dx + (py - y1) * dy) / lengthSq),
        )
  return Math.hypot(px - (x1 + along * dx), py - (y1 + along * dy))
}

function treeAtBp(data: ArgRegionData, bp: number) {
  let low = 0
  let high = data.numTrees - 1
  while (low < high) {
    const mid = (low + high + 1) >>> 1
    if (data.treeStart[mid]! <= bp) {
      low = mid
    } else {
      high = mid - 1
    }
  }
  return low
}

/**
 * A node's identity within one local tree, from what the payload carries about
 * it. The packer writes a node's laid-out x and its time through the same
 * Float32Array rounding whether it appears as an edge's child or as its parent,
 * so the two spellings of one node compare equal.
 */
function nodeKey(x: number, time: number) {
  return `${x},${time}`
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
  const below = new Map<string, number[]>()
  for (let j = from; j < to; j++) {
    const key = nodeKey(data.parentX[j]!, data.parentTime[j]!)
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
    const children = below.get(nodeKey(data.childX[j]!, data.childTime[j]!))
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
}

function toHit({ data, tree, edge }: Candidate): ArgHit {
  const shared = {
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
  const {
    canvasWidth,
    canvasHeight,
    maxTime,
    timeScale,
    pxPerLeaf,
    numSamples,
  } = state
  const dendrogramPx = Math.max(2, numSamples * pxPerLeaf)
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
      const { start, end, screenStartPx, screenEndPx, reversed } = block
      const toY = (time: number) =>
        timeToY(time, maxTime, canvasHeight, timeScale)
      const toPx = (bp: number) =>
        bpToScreenPx(bp, start, end, screenStartPx, screenEndPx, reversed)
      // The neighbours because a branch of the tree next door can still be
      // within the threshold of a cursor sitting just inside this one.
      const center = treeAtBp(data, bpAtPxExact(mouseX, block))
      const last = Math.min(data.numTrees - 1, center + 1)
      for (let i = Math.max(0, center - 1); i <= last; i++) {
        if (data.edgeCount[i]! > 0) {
          const a = toPx(data.treeStart[i]!)
          const b = toPx(data.treeEnd[i]!)
          const left = Math.min(a, b)
          const width = Math.abs(b - a)
          if (data.detail === 'trees' && width >= dendrogramPx) {
            const to = data.edgeOffset[i + 1]!
            for (let j = data.edgeOffset[i]!; j < to; j++) {
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
                best = { data, tree: i, edge: j }
              }
            }
          } else {
            const top = toY(data.tmrca[i]!)
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
              best = { data, tree: i, edge: undefined }
            }
          }
        }
      }
    }
  }
  return best === undefined ? undefined : toHit(best)
}
