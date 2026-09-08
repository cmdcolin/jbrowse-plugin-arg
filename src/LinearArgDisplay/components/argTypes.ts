import type { ArgRegionData } from '../../ArgRPC/rpcTypes.ts'
import type { PerRegionRenderingBackend } from '@jbrowse/render-core/perRegionRenderingBackend'

export type TimeScale = 'linear' | 'log'

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
  /** leaves need room to separate; below this a tree collapses to its TMRCA */
  pxPerLeaf: number
  numSamples: number
}

export type ArgRenderingBackend = PerRegionRenderingBackend<
  ArgRegionData,
  ArgRenderState
>
