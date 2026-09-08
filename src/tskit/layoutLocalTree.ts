import { NULL_NODE } from './TreeIterator.ts'

import type { TreeIterator } from './TreeIterator.ts'

/**
 * Scratch buffers for laying out one local tree at a time. A region holds
 * thousands of trees and every one of them wants arrays the size of the node
 * table, so they are allocated once per packing run and overwritten per tree.
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
  private readonly stack: Int32Array
  count = 0
  numLeaves = 0

  constructor(numNodes: number) {
    this.x = new Float32Array(numNodes)
    this.cladePop = new Int32Array(numNodes)
    this.preorder = new Int32Array(numNodes)
    this.stack = new Int32Array(numNodes)
  }

  /**
   * Lay the iterator's current tree out as a dendrogram: leaves evenly spaced
   * left to right in traversal order, each internal node centred between its
   * first and last child. `x` comes out normalized to 0..1 so the renderer can
   * scale it into whatever pixel span the tree's genomic interval occupies.
   */
  layout(tree: TreeIterator, roots: number[], nodePopulation?: Int32Array) {
    const { leftChild, rightChild, leftSib, rightSib } = tree
    const { x, preorder, stack } = this
    let top = 0
    for (let i = roots.length - 1; i >= 0; i--) {
      stack[top++] = roots[i]!
    }
    let count = 0
    while (top > 0) {
      const node = stack[--top]!
      preorder[count++] = node
      let child = rightChild[node]!
      while (child !== NULL_NODE) {
        stack[top++] = child
        child = leftSib[child]!
      }
    }
    const { cladePop } = this
    let numLeaves = 0
    for (let i = 0; i < count; i++) {
      const node = preorder[i]!
      if (leftChild[node] === NULL_NODE) {
        x[node] = numLeaves++
        cladePop[node] = nodePopulation ? nodePopulation[node]! : -1
      }
    }
    for (let i = count - 1; i >= 0; i--) {
      const node = preorder[i]!
      const first = leftChild[node]!
      if (first !== NULL_NODE) {
        x[node] = (x[first]! + x[rightChild[node]!]!) / 2
        let pop = cladePop[first]!
        let child = rightSib[first]!
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
}
