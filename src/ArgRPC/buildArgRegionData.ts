import {
  NULL_NODE,
  TreeIterator,
  treeBreakpoints,
} from '../tskit/TreeIterator.ts'
import { globalLeafRanks } from '../tskit/globalLeafOrder.ts'
import { LocalTreeLayout } from '../tskit/layoutLocalTree.ts'
import { PaintingPacker, sampleRows } from './packPainting.ts'

import type { TreeSequenceTables } from '../tskit/tables.ts'
import type { ArgRegionData } from './rpcTypes.ts'

const EMPTY_U32 = new Uint32Array(0)
const EMPTY_F32 = new Float32Array(0)
const EMPTY_I32 = new Int32Array(0)
const EMPTY_F64 = new Float64Array(0)

const EMPTY_I16 = new Int16Array(0)
const EMPTY_U8 = new Uint8Array(0)

const noMutations = {
  mutationEdge: EMPTY_I32,
  mutationTime: EMPTY_F32,
  mutationPosition: EMPTY_F64,
  mutationAllele: [] as string[],
}

function firstSiteAtOrAfter(positions: Float64Array, position: number) {
  let low = 0
  let high = positions.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (positions[mid]! < position) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  return low
}

function treeIndexAt(breakpoints: Float64Array, position: number) {
  let low = 0
  let high = breakpoints.length - 1
  while (low < high) {
    const mid = (low + high + 1) >>> 1
    if (breakpoints[mid]! <= position) {
      low = mid
    } else {
      high = mid - 1
    }
  }
  return low
}

function maxRootTime(tree: TreeIterator, tables: TreeSequenceTables) {
  const { samples, nodeTime } = tables
  let result = 0
  for (const sample of samples) {
    let node = sample
    while (tree.parent[node] !== NULL_NODE) {
      node = tree.parent[node]!
    }
    const time = nodeTime[node]!
    if (time > result) {
      result = time
    }
  }
  return result
}

function rootsOf(tree: TreeIterator, tables: TreeSequenceTables) {
  const seen = new Set<number>()
  const roots: number[] = []
  for (const sample of tables.samples) {
    let node = sample
    while (tree.parent[node] !== NULL_NODE) {
      node = tree.parent[node]!
    }
    if (!seen.has(node)) {
      seen.add(node)
      roots.push(node)
    }
  }
  return roots
}

function common(tables: TreeSequenceTables) {
  return {
    maxNodeTime: tables.maxNodeTime,
    numSamples: tables.numSamples,
    timeUnits: tables.timeUnits,
    populationNames: tables.populationNames,
    samplePopulations: tables.samplePopulations,
    sampleNames: tables.sampleNames,
    samplePopulation: tables.samples.map(node => tables.nodePopulation[node]!),
    sampleRows: sampleRows(tables),
  }
}

export function emptyArgRegionData(tables: TreeSequenceTables): ArgRegionData {
  return {
    detail: 'trees',
    treeStart: new Float64Array(0),
    treeEnd: new Float64Array(0),
    tmrca: EMPTY_F32,
    edgeCount: EMPTY_U32,
    edgeOffset: EMPTY_U32,
    childX: EMPTY_F32,
    parentX: EMPTY_F32,
    childTime: EMPTY_F32,
    parentTime: EMPTY_F32,
    childNode: EMPTY_I32,
    parentNode: EMPTY_I32,
    edgePop: EMPTY_I32,
    ...noMutations,
    paintPopulation: EMPTY_I16,
    paintShare: EMPTY_U8,
    numTrees: 0,
    treesInRegion: 0,
    ...common(tables),
  }
}

/**
 * Pack the local trees overlapping `[start, end)`.
 *
 * How much detail survives is decided here rather than at draw time: a region
 * holding more edges than `maxEdges` comes back as a TMRCA skyline, binned down
 * to `maxSkylinePoints`. The region the display fetches is the buffered
 * viewport, so this is the zoom-dependent decision without zoom ever entering
 * the fetch inputs.
 */
export function buildArgRegionData({
  tables,
  start,
  end,
  maxEdges,
  maxSkylinePoints,
  painting = false,
}: {
  tables: TreeSequenceTables
  start: number
  end: number
  maxEdges: number
  maxSkylinePoints: number
  painting?: boolean
}): ArgRegionData {
  const breakpoints = treeBreakpoints(tables)
  const firstTree = treeIndexAt(breakpoints, start)
  const lastTree = treeIndexAt(breakpoints, Math.max(start, end - 1e-9))
  const treesInRegion = lastTree - firstTree + 1
  const edgesPerTree = Math.max(1, 2 * tables.numSamples)
  const tree = new TreeIterator(tables)
  tree.seek(start)

  if (treesInRegion * edgesPerTree > maxEdges) {
    const numTrees = Math.min(treesInRegion, maxSkylinePoints)
    const treeStart = new Float64Array(numTrees)
    const treeEnd = new Float64Array(numTrees)
    const tmrca = new Float32Array(numTrees)
    const edgeCount = new Uint32Array(numTrees)
    const binWidth = treesInRegion / numTrees
    const painter = painting ? new PaintingPacker(tables, numTrees) : undefined
    let bin = 0
    let binEndTree = binWidth
    treeStart[0] = tree.left
    for (let i = 0; i < treesInRegion; i++) {
      painter?.add(tree)
      const time = maxRootTime(tree, tables)
      if (time > tmrca[bin]!) {
        tmrca[bin] = time
      }
      edgeCount[bin] = edgeCount[bin]! + tree.edgeCount
      treeEnd[bin] = tree.right
      if (i + 1 >= binEndTree && bin + 1 < numTrees) {
        painter?.close(bin)
        bin++
        binEndTree += binWidth
        treeStart[bin] = tree.right
      }
      if (!tree.next()) {
        break
      }
    }
    painter?.close(bin)
    return {
      detail: 'skyline',
      treeStart,
      treeEnd,
      tmrca,
      edgeCount,
      edgeOffset: EMPTY_U32,
      childX: EMPTY_F32,
      parentX: EMPTY_F32,
      childTime: EMPTY_F32,
      parentTime: EMPTY_F32,
      childNode: EMPTY_I32,
      parentNode: EMPTY_I32,
      edgePop: EMPTY_I32,
      ...noMutations,
      paintPopulation: painter?.population ?? EMPTY_I16,
      paintShare: painter?.share ?? EMPTY_U8,
      numTrees,
      treesInRegion,
      ...common(tables),
    }
  }

  const treeStart = new Float64Array(treesInRegion)
  const treeEnd = new Float64Array(treesInRegion)
  const tmrca = new Float32Array(treesInRegion)
  const edgeCount = new Uint32Array(treesInRegion)
  const edgeOffset = new Uint32Array(treesInRegion + 1)
  const capacity = treesInRegion * edgesPerTree
  const childX = new Float32Array(capacity)
  const parentX = new Float32Array(capacity)
  const childTime = new Float32Array(capacity)
  const parentTime = new Float32Array(capacity)
  const childNode = new Int32Array(capacity)
  const parentNode = new Int32Array(capacity)
  const edgePop = new Int32Array(capacity)
  const layout = new LocalTreeLayout(tables.numNodes, globalLeafRanks(tables))
  const {
    nodeTime,
    sitePosition,
    siteMutationOffset,
    siteAncestralState,
    mutationNode,
    mutationDerivedState,
  } = tables
  // stale entries from earlier trees point below this tree's first edge
  const edgeAbove = new Int32Array(tables.numNodes).fill(-1)
  const mutationEdge: number[] = []
  const mutationTime: number[] = []
  const mutationPosition: number[] = []
  const mutationAllele: string[] = []
  const painter = painting
    ? new PaintingPacker(tables, treesInRegion)
    : undefined
  let site = firstSiteAtOrAfter(sitePosition, tree.left)
  let written = 0

  for (let i = 0; i < treesInRegion; i++) {
    treeStart[i] = tree.left
    treeEnd[i] = tree.right
    const roots = rootsOf(tree, tables)
    layout.layout(tree, roots, tables.nodePopulation)
    let treeMax = 0
    for (const root of roots) {
      treeMax = Math.max(treeMax, nodeTime[root]!)
    }
    tmrca[i] = treeMax
    for (let j = 0; j < layout.count && written < capacity; j++) {
      const node = layout.preorder[j]!
      const parent = tree.parent[node]!
      if (parent !== NULL_NODE) {
        childX[written] = layout.x[node]!
        parentX[written] = layout.x[parent]!
        childTime[written] = nodeTime[node]!
        parentTime[written] = nodeTime[parent]!
        childNode[written] = node
        parentNode[written] = parent
        edgePop[written] = layout.cladePop[node]!
        edgeAbove[node] = written
        written++
      }
    }
    for (
      ;
      site < sitePosition.length && sitePosition[site]! < tree.right;
      site++
    ) {
      const to = siteMutationOffset[site + 1]!
      for (let m = siteMutationOffset[site]!; m < to; m++) {
        const edge = edgeAbove[mutationNode[m]!]!
        if (edge >= edgeOffset[i]!) {
          mutationEdge.push(edge)
          mutationTime.push(tables.mutationTime[m]!)
          mutationPosition.push(sitePosition[site]!)
          mutationAllele.push(
            `${siteAncestralState[site] ?? ''}>${mutationDerivedState[m] ?? ''}`,
          )
        }
      }
    }
    if (painter) {
      painter.add(tree)
      painter.close(i)
    }
    edgeOffset[i + 1] = written
    edgeCount[i] = written - edgeOffset[i]!
    if (!tree.next()) {
      break
    }
  }

  return {
    detail: 'trees',
    treeStart,
    treeEnd,
    tmrca,
    edgeCount,
    edgeOffset,
    childX: childX.slice(0, written),
    parentX: parentX.slice(0, written),
    childTime: childTime.slice(0, written),
    parentTime: parentTime.slice(0, written),
    childNode: childNode.slice(0, written),
    parentNode: parentNode.slice(0, written),
    edgePop: edgePop.slice(0, written),
    mutationEdge: Int32Array.from(mutationEdge),
    mutationTime: Float32Array.from(mutationTime),
    mutationPosition: Float64Array.from(mutationPosition),
    mutationAllele,
    paintPopulation: painter?.population ?? EMPTY_I16,
    paintShare: painter?.share ?? EMPTY_U8,
    numTrees: treesInRegion,
    treesInRegion,
    ...common(tables),
  }
}
