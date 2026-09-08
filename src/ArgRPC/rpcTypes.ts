import type { Region } from '@jbrowse/core/util'

/**
 * One region's worth of local trees, packed into parallel typed arrays.
 *
 * `trees` carries every edge of every local tree in the region, with node x
 * positions normalized to 0..1 inside the tree's own genomic interval, so the
 * renderer needs only the interval's pixel span to place them. `skyline` drops
 * the topology and keeps one TMRCA per tree, which is what survives when a
 * region holds more trees than can be drawn as trees.
 */
export type ArgDetail = 'trees' | 'skyline'

export interface ArgRegionData {
  detail: ArgDetail
  treeStart: Float64Array
  treeEnd: Float64Array
  tmrca: Float32Array
  /** `numTrees + 1` entries; empty when `detail` is `skyline` */
  edgeOffset: Uint32Array
  childX: Float32Array
  parentX: Float32Array
  childTime: Float32Array
  parentTime: Float32Array
  childNode: Int32Array
  numTrees: number
  /** trees in the region before any binning, so the display can say so */
  treesInRegion: number
  maxNodeTime: number
  numSamples: number
  timeUnits: string
}

export interface ArgGetRegionArgs {
  adapterConfig: Record<string, unknown>
  region: Region
  maxEdges: number
  maxSkylinePoints: number
}
