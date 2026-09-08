import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { buildArgRegionData } from '../src/ArgRPC/buildArgRegionData.ts'
import { NULL_NODE, TreeIterator } from '../src/tskit/TreeIterator.ts'
import { globalLeafRanks } from '../src/tskit/globalLeafOrder.ts'
import { LocalTreeLayout } from '../src/tskit/layoutLocalTree.ts'
import { readTreeSequenceTables } from '../src/tskit/tables.ts'

const file = fs.readFileSync(
  path.join(import.meta.dirname, '../test_data/small.trees'),
)
const tables = readTreeSequenceTables(
  file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength,
  ) as ArrayBuffer,
)

function leafPositions(count: number, ranked: boolean) {
  const tree = new TreeIterator(tables)
  tree.seek(0)
  const layout = ranked
    ? new LocalTreeLayout(tables.numNodes, globalLeafRanks(tables))
    : new LocalTreeLayout(tables.numNodes)
  const result: Map<number, number>[] = []
  for (let i = 0; i < count; i++) {
    layout.layout(tree, tree.roots())
    const positions = new Map<number, number>()
    for (let j = 0; j < layout.numLeaves; j++) {
      positions.set(layout.leafOrder[j]!, j)
    }
    result.push(positions)
    if (!tree.next()) {
      break
    }
  }
  return result
}

/** Spearman rank correlation of two orderings of the same leaves. */
function orderCorrelation(a: Map<number, number>, b: Map<number, number>) {
  let sum = 0
  let n = 0
  for (const [leaf, position] of a) {
    const other = b.get(leaf)
    if (other !== undefined) {
      const d = position - other
      sum += d * d
      n++
    }
  }
  return n > 1 ? 1 - (6 * sum) / (n * (n * n - 1)) : 1
}

function meanAdjacentCorrelation(orders: Map<number, number>[]) {
  let total = 0
  for (let i = 1; i < orders.length; i++) {
    total += orderCorrelation(orders[i - 1]!, orders[i]!)
  }
  return total / (orders.length - 1)
}

function leavesUnder(tree: TreeIterator, node: number) {
  const leaves: number[] = []
  const stack = [node]
  while (stack.length > 0) {
    const current = stack.pop()!
    let child = tree.leftChild[current]!
    if (child === NULL_NODE) {
      leaves.push(current)
    }
    while (child !== NULL_NODE) {
      stack.push(child)
      child = tree.rightSib[child]!
    }
  }
  return leaves
}

function contiguous(positions: number[]) {
  return (
    Math.max(...positions) - Math.min(...positions) + 1 === positions.length
  )
}

describe('a genome-wide leaf order', () => {
  test('ranks every sample distinctly and stays cached', () => {
    const ranks = globalLeafRanks(tables)
    expect(globalLeafRanks(tables)).toBe(ranks)
    const sampleRanks = [...tables.samples].map(sample => ranks[sample]!)
    expect(new Set(sampleRanks).size).toBe(tables.numSamples)
    expect([...sampleRanks].sort((a, b) => a - b)).toEqual(
      Array.from({ length: tables.numSamples }, (_, i) => i),
    )
  })

  test('adjacent trees agree on their leaf order far better than before', () => {
    const before = meanAdjacentCorrelation(leafPositions(400, false))
    const after = meanAdjacentCorrelation(leafPositions(400, true))
    expect(before).toBeLessThan(0.7)
    expect(after).toBeGreaterThan(0.8)
  })

  test('every tree stays close to the global order, not just to its neighbour', () => {
    const ranks = globalLeafRanks(tables)
    const global = new Map(
      [...tables.samples].map(sample => [sample, ranks[sample]!]),
    )
    const agreement = (ranked: boolean) => {
      const orders = leafPositions(400, ranked)
      let total = 0
      for (const order of orders) {
        total += orderCorrelation(order, global)
      }
      return total / orders.length
    }
    expect(Math.abs(agreement(false))).toBeLessThan(0.1)
    expect(agreement(true)).toBeGreaterThan(0.4)
  })

  // Rotating is the whole reason the leaves are not simply sorted into the
  // global order, so the control counts what sorting them would cost: a clade
  // whose leaves no longer sit next to each other is a dendrogram with a branch
  // drawn across its neighbours.
  test('a rotation never splits a clade, where sorting the leaves would', () => {
    const ranks = globalLeafRanks(tables)
    const tree = new TreeIterator(tables)
    tree.seek(0)
    const layout = new LocalTreeLayout(tables.numNodes, ranks)
    let split = 0
    let splitWhenSorted = 0
    for (let i = 0; i < 300; i++) {
      layout.layout(tree, tree.roots())
      const position = new Map<number, number>()
      for (let j = 0; j < layout.numLeaves; j++) {
        position.set(layout.leafOrder[j]!, j)
      }
      const sorted = new Map(
        [...position.keys()]
          .sort((a, b) => ranks[a]! - ranks[b]!)
          .map((leaf, index) => [leaf, index]),
      )
      for (let j = 0; j < layout.count; j++) {
        const leaves = leavesUnder(tree, layout.preorder[j]!)
        if (!contiguous(leaves.map(leaf => position.get(leaf)!))) {
          split++
        }
        if (!contiguous(leaves.map(leaf => sorted.get(leaf)!))) {
          splitWhenSorted++
        }
      }
      if (!tree.next()) {
        break
      }
    }
    expect(split).toBe(0)
    expect(splitWhenSorted).toBeGreaterThan(1000)
  })

  test('a tree lays out the same however the region around it is cut', () => {
    const wide = buildArgRegionData({
      tables,
      start: 0,
      end: 4000,
      maxEdges: 500_000,
      maxSkylinePoints: 5000,
    })
    const narrow = buildArgRegionData({
      tables,
      start: 2000,
      end: 4000,
      maxEdges: 500_000,
      maxSkylinePoints: 5000,
    })
    const wideIndex = [...wide.treeStart].indexOf(narrow.treeStart[0]!)
    expect(wideIndex).toBeGreaterThan(0)
    const from = wide.edgeOffset[wideIndex]!
    const count = wide.edgeCount[wideIndex]!
    expect(count).toBe(narrow.edgeCount[0])
    expect([...wide.childX.slice(from, from + count)]).toEqual([
      ...narrow.childX.slice(0, count),
    ])
  })
})
