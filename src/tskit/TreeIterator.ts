import type { TreeSequenceTables } from './tables.ts'

export const NULL_NODE = -1

function upperBound(values: Float64Array, order: Int32Array, target: number) {
  let low = 0
  let high = order.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (values[order[mid]!]! <= target) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  return low
}

/**
 * A local tree, maintained incrementally across the sequence by inserting and
 * removing edges at breakpoints. The quintuply-linked representation is the one
 * tskit uses: `parent` answers upward walks, and `leftChild`/`rightSib` a
 * downward traversal, both without allocating per tree.
 */
export class TreeIterator {
  readonly parent: Int32Array
  readonly leftChild: Int32Array
  readonly rightChild: Int32Array
  readonly leftSib: Int32Array
  readonly rightSib: Int32Array
  private readonly removed: Uint8Array
  private readonly tables: TreeSequenceTables

  left = 0
  right = 0
  index = -1
  /** edges in the current tree; zero means no genealogy covers this span */
  edgeCount = 0
  private insertionIndex = 0
  private removalIndex = 0

  constructor(tables: TreeSequenceTables) {
    this.tables = tables
    const { numNodes, numEdges } = tables
    this.parent = new Int32Array(numNodes)
    this.leftChild = new Int32Array(numNodes)
    this.rightChild = new Int32Array(numNodes)
    this.leftSib = new Int32Array(numNodes)
    this.rightSib = new Int32Array(numNodes)
    this.removed = new Uint8Array(numEdges)
    this.clear()
  }

  private clear() {
    this.parent.fill(NULL_NODE)
    this.leftChild.fill(NULL_NODE)
    this.rightChild.fill(NULL_NODE)
    this.leftSib.fill(NULL_NODE)
    this.rightSib.fill(NULL_NODE)
    this.edgeCount = 0
  }

  private insert(edge: number) {
    const { edgeParent, edgeChild } = this.tables
    const p = edgeParent[edge]!
    const c = edgeChild[edge]!
    this.parent[c] = p
    const last = this.rightChild[p]!
    if (last === NULL_NODE) {
      this.leftChild[p] = c
      this.leftSib[c] = NULL_NODE
    } else {
      this.rightSib[last] = c
      this.leftSib[c] = last
    }
    this.rightChild[p] = c
    this.rightSib[c] = NULL_NODE
    this.edgeCount++
  }

  private remove(edge: number) {
    const { edgeParent, edgeChild } = this.tables
    const p = edgeParent[edge]!
    const c = edgeChild[edge]!
    const lsib = this.leftSib[c]!
    const rsib = this.rightSib[c]!
    if (lsib === NULL_NODE) {
      this.leftChild[p] = rsib
    } else {
      this.rightSib[lsib] = rsib
    }
    if (rsib === NULL_NODE) {
      this.rightChild[p] = lsib
    } else {
      this.leftSib[rsib] = lsib
    }
    this.parent[c] = NULL_NODE
    this.leftSib[c] = NULL_NODE
    this.rightSib[c] = NULL_NODE
    this.edgeCount--
  }

  private setBounds(left: number) {
    const { edgeLeft, edgeRight, insertionOrder, removalOrder, numEdges } =
      this.tables
    let right = this.tables.sequenceLength
    if (this.insertionIndex < numEdges) {
      right = Math.min(right, edgeLeft[insertionOrder[this.insertionIndex]!]!)
    }
    if (this.removalIndex < numEdges) {
      right = Math.min(right, edgeRight[removalOrder[this.removalIndex]!]!)
    }
    this.left = left
    this.right = right
  }

  /**
   * Jump straight to the tree covering `position` without replaying every
   * breakpoint before it. The stored edge indexes are sorted by left and by
   * right, so the two binary searches bound the edges that have been inserted
   * and the ones already removed; the active set is the difference.
   */
  seek(position: number) {
    const { edgeLeft, edgeRight, insertionOrder, removalOrder } = this.tables
    this.clear()
    this.removed.fill(0)
    this.insertionIndex = upperBound(edgeLeft, insertionOrder, position)
    this.removalIndex = upperBound(edgeRight, removalOrder, position)
    for (let k = 0; k < this.removalIndex; k++) {
      this.removed[removalOrder[k]!] = 1
    }
    for (let j = 0; j < this.insertionIndex; j++) {
      const edge = insertionOrder[j]!
      if (this.removed[edge] === 0) {
        this.insert(edge)
      }
    }
    const breakpoints = treeBreakpoints(this.tables)
    this.index = this.treeIndexAt(position)
    this.left = breakpoints[this.index]!
    this.right = breakpoints[this.index + 1]!
  }

  next() {
    const { edgeLeft, edgeRight, insertionOrder, removalOrder, numEdges } =
      this.tables
    const left = this.right
    if (left >= this.tables.sequenceLength) {
      return false
    }
    while (
      this.removalIndex < numEdges &&
      edgeRight[removalOrder[this.removalIndex]!]! === left
    ) {
      this.remove(removalOrder[this.removalIndex]!)
      this.removalIndex++
    }
    while (
      this.insertionIndex < numEdges &&
      edgeLeft[insertionOrder[this.insertionIndex]!]! === left
    ) {
      this.insert(insertionOrder[this.insertionIndex]!)
      this.insertionIndex++
    }
    this.setBounds(left)
    this.index++
    return true
  }

  private treeIndexAt(position: number) {
    const breakpoints = treeBreakpoints(this.tables)
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

  /** The nodes with no parent that still carry children, plus lone samples. */
  roots() {
    const { samples } = this.tables
    const result: number[] = []
    const seen = new Set<number>()
    for (const sample of samples) {
      let node = sample
      while (this.parent[node] !== NULL_NODE) {
        node = this.parent[node]!
      }
      if (!seen.has(node)) {
        seen.add(node)
        result.push(node)
      }
    }
    return result
  }
}

const breakpointCache = new WeakMap<TreeSequenceTables, Float64Array>()

export function treeBreakpoints(tables: TreeSequenceTables) {
  const cached = breakpointCache.get(tables)
  if (cached) {
    return cached
  }
  const { edgeLeft, edgeRight, insertionOrder, removalOrder, sequenceLength } =
    tables
  const points = new Set<number>([0, sequenceLength])
  for (const edge of insertionOrder) {
    points.add(edgeLeft[edge]!)
  }
  for (const edge of removalOrder) {
    points.add(edgeRight[edge]!)
  }
  const sorted = Float64Array.from(points).sort()
  breakpointCache.set(tables, sorted)
  return sorted
}

export function numTrees(tables: TreeSequenceTables) {
  return treeBreakpoints(tables).length - 1
}
