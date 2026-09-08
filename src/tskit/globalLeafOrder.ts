import { TreeIterator } from './TreeIterator.ts'
import { LocalTreeLayout } from './layoutLocalTree.ts'

import type { TreeSequenceTables } from './tables.ts'

const cache = new WeakMap<TreeSequenceTables, Float64Array>()

/**
 * The middle of the span the edges actually cover, which is not the middle of
 * the sequence when a tree sequence carries genealogy for one window only.
 */
function referencePosition(tables: TreeSequenceTables) {
  const { edgeLeft, edgeRight, sequenceLength } = tables
  let left = sequenceLength
  let right = 0
  for (let i = 0; i < edgeLeft.length; i++) {
    if (edgeLeft[i]! < left) {
      left = edgeLeft[i]!
    }
    if (edgeRight[i]! > right) {
      right = edgeRight[i]!
    }
  }
  return right > left ? (left + right) / 2 : 0
}

/**
 * One leaf ordering for the whole tree sequence, as a rank per node, so that
 * every local tree can be rotated towards it instead of laying its leaves out
 * in whatever order its own edges happen to be linked in.
 *
 * It is read off a single reference tree, and off the same one whatever region
 * is being packed, so panning and zooming never re-order the picture. That tree
 * is a central one because recombination walks the leaf order away from the
 * reference in both directions.
 */
export function globalLeafRanks(tables: TreeSequenceTables) {
  const cached = cache.get(tables)
  if (cached) {
    return cached
  }
  const { numNodes } = tables
  const tree = new TreeIterator(tables)
  tree.seek(referencePosition(tables))
  const layout = new LocalTreeLayout(numNodes)
  layout.layout(tree, tree.roots())
  const ranks = new Float64Array(numNodes)
  // A node the reference tree holds no leaf for still needs a rank, for the
  // trees that do make it a leaf: it sorts to the right of every ranked leaf,
  // in node id order, so those trees lay out the same way every time.
  for (let node = 0; node < numNodes; node++) {
    ranks[node] = layout.numLeaves + node / numNodes
  }
  for (let i = 0; i < layout.numLeaves; i++) {
    ranks[layout.leafOrder[i]!] = i
  }
  cache.set(tables, ranks)
  return ranks
}
