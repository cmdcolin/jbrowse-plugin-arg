import type { ArgRegionData } from '../../ArgRPC/rpcTypes.ts'
import type { PerRegionRenderingBackend } from '@jbrowse/render-core/perRegionRenderingBackend'

export type TimeScale = 'linear' | 'log'

/**
 * The width a local tree needs before its topology is drawn instead of its
 * TMRCA. Four things decide against it — the branch painter, the cell painter,
 * the hit test and the legend — and a disagreement between any two of them is
 * only visible by hovering: a tree drawn as a dendrogram that hit-tests as a
 * skyline, or a legend over a plot with one color in it.
 */
export function dendrogramPx(numSamples: number, pxPerLeaf: number) {
  return Math.max(2, numSamples * pxPerLeaf)
}

/** the config slot is a two-value enum, so anything else is the default */
export function toTimeScale(value: string): TimeScale {
  return value === 'linear' ? 'linear' : 'log'
}

export interface ArgRenderState {
  canvasWidth: number
  canvasHeight: number
  /** the whole file's oldest node, so the y axis does not move as you pan */
  maxTime: number
  timeScale: TimeScale
  branchColor: string
  skylineColor: string
  gridlineColor: string
  /** background behind one local tree; empty when trees are not separated */
  treeCellColor: string
  /** color per population id; empty when branches are drawn one color */
  populationColors: string[]
  /** leaves need room to separate; below this a tree collapses to its TMRCA */
  pxPerLeaf: number
  numSamples: number
}

export type ArgRenderingBackend = PerRegionRenderingBackend<
  ArgRegionData,
  ArgRenderState
>
