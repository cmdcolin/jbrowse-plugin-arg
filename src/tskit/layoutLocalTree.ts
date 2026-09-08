import { NULL_NODE } from './TreeIterator.ts'

import type { TreeIterator } from './TreeIterator.ts'

/**
 * Scratch buffers for laying out one local tree at a time. A region holds
 * thousands of trees and every one of them wants arrays the size of the node
 * table, so they are allocated once per packing run and overwritten per tree.
 *
 * Given `globalRank`, every internal node's children come out ordered by the
 * mean rank of the leaves below them. Sorting the leaves into that order
 * outright would tear clades apart and there is nothing left to read in a
 * dendrogram whose clades are not contiguous; rotating each node is the freedom
 * that costs nothing, and it lands adjacent trees — which differ by one moved
 * subtree — on near-identical pictures.
 */
export class LocalTreeLayout {
  readonly x: Float32Array
  /**
   * The population every leaf under a node belongs to, or -1 where they differ.
   * A branch leading to one population is the thing worth coloring; a branch
   * above the point two populations join is not any one of them.
   */
  readonly cladePop: Int32Array
  readonly preorder: Int32Array
  /** the leaves left to right, which is the order this tree was laid out in */
  readonly leafOrder: Int32Array
  private readonly stack: Int32Array
  private readonly siblings: Int32Array
  private readonly firstChild: Int32Array
  private readonly lastChild: Int32Array
  private readonly cladeRank: Float64Array
  private readonly cladeLeaves: Int32Array
  private readonly globalRank: Float64Array | undefined
  count = 0
  numLeaves = 0

  constructor(numNodes: number, globalRank?: Float64Array) {
    this.x = new Float32Array(numNodes)
    this.cladePop = new Int32Array(numNodes)
    this.preorder = new Int32Array(numNodes)
    this.leafOrder = new Int32Array(numNodes)
    this.stack = new Int32Array(numNodes)
    this.siblings = new Int32Array(numNodes)
    this.firstChild = new Int32Array(numNodes)
    this.lastChild = new Int32Array(numNodes)
    this.cladeRank = new Float64Array(numNodes)
    this.cladeLeaves = new Int32Array(numNodes)
    this.globalRank = globalRank
  }

  /**
   * Lay the iterator's current tree out as a dendrogram: leaves evenly spaced
   * left to right in traversal order, each internal node centred between its
   * first and last child. `x` comes out normalized to 0..1 so the renderer can
   * scale it into whatever pixel span the tree's genomic interval occupies.
   */
  layout(tree: TreeIterator, roots: number[], nodePopulation?: Int32Array) {
    const { leftChild, rightSib } = tree
    const { x, preorder, stack, siblings, firstChild, lastChild, globalRank } =
      this
    if (globalRank) {
      this.rankClades(tree, roots, globalRank)
    }
    let top = 0
    let siblingCount = roots.length
    for (let i = 0; i < siblingCount; i++) {
      siblings[i] = roots[i]!
    }
    if (globalRank) {
      this.sortSiblings(siblingCount)
    }
    for (let i = siblingCount - 1; i >= 0; i--) {
      stack[top++] = siblings[i]!
    }
    let count = 0
    while (top > 0) {
      const node = stack[--top]!
      preorder[count++] = node
      siblingCount = 0
      for (let child = leftChild[node]!; child !== NULL_NODE;) {
        siblings[siblingCount++] = child
        child = rightSib[child]!
      }
      if (globalRank) {
        this.sortSiblings(siblingCount)
      }
      firstChild[node] = siblingCount > 0 ? siblings[0]! : NULL_NODE
      lastChild[node] =
        siblingCount > 0 ? siblings[siblingCount - 1]! : NULL_NODE
      for (let i = siblingCount - 1; i >= 0; i--) {
        stack[top++] = siblings[i]!
      }
    }
    const { cladePop, leafOrder } = this
    let numLeaves = 0
    for (let i = 0; i < count; i++) {
      const node = preorder[i]!
      if (firstChild[node] === NULL_NODE) {
        leafOrder[numLeaves] = node
        x[node] = numLeaves++
        cladePop[node] = nodePopulation ? nodePopulation[node]! : -1
      }
    }
    for (let i = count - 1; i >= 0; i--) {
      const node = preorder[i]!
      const first = firstChild[node]!
      if (first !== NULL_NODE) {
        x[node] = (x[first]! + x[lastChild[node]!]!) / 2
        const native = leftChild[node]!
        let pop = cladePop[native]!
        let child = rightSib[native]!
        while (child !== NULL_NODE && pop !== -1) {
          if (cladePop[child] !== pop) {
            pop = -1
          }
          child = rightSib[child]!
        }
        cladePop[node] = pop
      }
    }
    const scale = numLeaves > 0 ? 1 / numLeaves : 1
    for (let i = 0; i < count; i++) {
      const node = preorder[i]!
      x[node] = (x[node]! + 0.5) * scale
    }
    this.count = count
    this.numLeaves = numLeaves
  }

  /** The mean global rank of the leaves under each node, bottom up. */
  private rankClades(
    tree: TreeIterator,
    roots: number[],
    globalRank: Float64Array,
  ) {
    const { leftChild, rightSib } = tree
    const { preorder, stack, cladeRank, cladeLeaves } = this
    let top = 0
    for (const root of roots) {
      stack[top++] = root
    }
    let count = 0
    while (top > 0) {
      const node = stack[--top]!
      preorder[count++] = node
      for (let child = leftChild[node]!; child !== NULL_NODE;) {
        stack[top++] = child
        child = rightSib[child]!
      }
    }
    for (let i = count - 1; i >= 0; i--) {
      const node = preorder[i]!
      const first = leftChild[node]!
      if (first === NULL_NODE) {
        cladeLeaves[node] = 1
        cladeRank[node] = globalRank[node]!
      } else {
        let leaves = 0
        let sum = 0
        for (let child = first; child !== NULL_NODE;) {
          leaves += cladeLeaves[child]!
          sum += cladeRank[child]! * cladeLeaves[child]!
          child = rightSib[child]!
        }
        cladeLeaves[node] = leaves
        cladeRank[node] = sum / leaves
      }
    }
  }

  /**
   * Insertion sort, because a node has two children far more often than it has
   * many. Node id breaks a tie so the order never depends on which sibling the
   * edge table happened to link first.
   */
  private sortSiblings(count: number) {
    const { siblings } = this
    for (let i = 1; i < count; i++) {
      const node = siblings[i]!
      let j = i - 1
      while (j >= 0 && this.rightOf(siblings[j]!, node)) {
        siblings[j + 1] = siblings[j]!
        j--
      }
      siblings[j + 1] = node
    }
  }

  private rightOf(a: number, b: number) {
    const { cladeRank } = this
    return (
      cladeRank[a]! > cladeRank[b]! ||
      (cladeRank[a]! === cladeRank[b]! && a > b)
    )
  }
}
