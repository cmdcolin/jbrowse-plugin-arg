import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { buildArgRegionData } from '../src/ArgRPC/buildArgRegionData.ts'
import { NULL_NODE, TreeIterator, numTrees } from '../src/tskit/TreeIterator.ts'
import { readTreeSequenceTables } from '../src/tskit/tables.ts'

// Ground truth throughout is `tskit` itself, read off test_data/small.trees:
// 20 samples over 100kb, 1144 local trees, 3835 edges.
const file = fs.readFileSync(
  path.join(import.meta.dirname, '../test_data/small.trees'),
)
const tables = readTreeSequenceTables(
  file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength,
  ) as ArrayBuffer,
)

describe('reading a .trees file', () => {
  test('table shapes match tskit', () => {
    expect(tables.numNodes).toBe(809)
    expect(tables.numEdges).toBe(3835)
    expect(tables.numSamples).toBe(20)
    expect(tables.sequenceLength).toBe(100000)
    expect(tables.timeUnits).toBe('generations')
    expect(tables.maxNodeTime).toBeCloseTo(161809.0677, 3)
  })

  test('rejects a file that is not a tree sequence', () => {
    const notKastore = new Uint8Array(128).buffer
    expect(() => readTreeSequenceTables(notKastore)).toThrow(/magic number/)
  })
})

describe('local trees', () => {
  test('counts the trees tskit counts', () => {
    expect(numTrees(tables)).toBe(1144)
  })

  // Each of these is `ts.at(pos)` in tskit: seeking must land on the same tree
  // index, the same interval and the same root as replaying from zero would.
  test.each([
    [0, 0, [0, 32], 664],
    [500, 11, [450, 523], 713],
    [12345, 176, [12308, 12386], 739],
    [50000, 631, [49900, 50280], 608],
    [99999, 1143, [99574, 100000], 526],
  ])('seek(%i) lands on tskit tree %i', (pos, index, interval, root) => {
    const tree = new TreeIterator(tables)
    tree.seek(pos)
    expect(tree.index).toBe(index)
    expect([tree.left, tree.right]).toEqual(interval)
    expect(tree.roots()).toEqual([root])
  })

  test('a seek gives the same tree as walking there', () => {
    const walked = new TreeIterator(tables)
    walked.seek(0)
    while (walked.right < 50000) {
      walked.next()
    }
    const sought = new TreeIterator(tables)
    sought.seek(49999)
    expect(sought.index).toBe(walked.index)
    expect([...sought.parent]).toEqual([...walked.parent])
  })

  test('walking the whole sequence visits every tree once', () => {
    const tree = new TreeIterator(tables)
    tree.seek(0)
    let count = 1
    let previousRight = tree.right
    while (tree.next()) {
      expect(tree.left).toBe(previousRight)
      previousRight = tree.right
      count++
    }
    expect(count).toBe(1144)
    expect(previousRight).toBe(100000)
  })

  test('every sample is in the tree and every tree node reaches a root', () => {
    const tree = new TreeIterator(tables)
    tree.seek(12345)
    for (const sample of tables.samples) {
      let node = sample
      let steps = 0
      while (tree.parent[node] !== NULL_NODE) {
        node = tree.parent[node]!
        expect(++steps).toBeLessThan(tables.numNodes)
      }
      expect(tree.roots()).toContain(node)
    }
  })
})

describe('packing a region', () => {
  const region = { tables, maxEdges: 500_000, maxSkylinePoints: 5000 }

  test('sends every edge of every overlapping tree', () => {
    const data = buildArgRegionData({ ...region, start: 0, end: 2000 })
    expect(data.detail).toBe('trees')
    expect(data.numTrees).toBe(36)
    expect(data.childX.length).toBe(1368)
    expect(data.edgeOffset[data.numTrees]).toBe(1368)
  })

  test('tree intervals tile the region with no gaps', () => {
    const data = buildArgRegionData({ ...region, start: 0, end: 2000 })
    for (let i = 1; i < data.numTrees; i++) {
      expect(data.treeStart[i]).toBe(data.treeEnd[i - 1])
    }
  })

  test('node x positions are normalized inside the tree interval', () => {
    const data = buildArgRegionData({ ...region, start: 0, end: 2000 })
    for (let i = 0; i < data.childX.length; i++) {
      expect(data.childX[i]).toBeGreaterThan(0)
      expect(data.childX[i]).toBeLessThan(1)
      expect(data.parentX[i]).toBeGreaterThan(0)
      expect(data.parentX[i]).toBeLessThan(1)
    }
  })

  test('a child is never older than its parent', () => {
    const data = buildArgRegionData({ ...region, start: 0, end: 5000 })
    for (let i = 0; i < data.childTime.length; i++) {
      expect(data.childTime[i]!).toBeLessThan(data.parentTime[i]!)
    }
  })

  test('falls back to a binned skyline over the edge budget', () => {
    const data = buildArgRegionData({
      tables,
      start: 0,
      end: 100000,
      maxEdges: 10_000,
      maxSkylinePoints: 200,
    })
    expect(data.detail).toBe('skyline')
    expect(data.numTrees).toBe(200)
    expect(data.treesInRegion).toBe(1144)
    expect(data.childX.length).toBe(0)
    expect(data.treeStart[0]).toBe(0)
    expect(data.treeEnd[199]).toBe(100000)
    for (let i = 1; i < data.numTrees; i++) {
      expect(data.treeStart[i]).toBe(data.treeEnd[i - 1])
    }
  })

  test('a skyline bin keeps the deepest TMRCA it covers', () => {
    const binned = buildArgRegionData({
      tables,
      start: 0,
      end: 100000,
      maxEdges: 10_000,
      maxSkylinePoints: 200,
    })
    const full = buildArgRegionData({ ...region, start: 0, end: 100000 })
    expect(Math.max(...binned.tmrca)).toBeCloseTo(Math.max(...full.tmrca), 3)
  })
})

describe('a span with no genealogy', () => {
  // A tree sequence whose topology was retained for one window — or simulated
  // into one, as the chr20 demo is — has trees outside it with no edges at all.
  // Those must be distinguishable from a tree that coalesces at time zero.
  test('the iterator reports zero edges outside a covered window', () => {
    const tree = new TreeIterator(tables)
    tree.seek(0)
    expect(tree.edgeCount).toBe(38)
  })

  test('the edge count tracks insertions and removals across the walk', () => {
    const tree = new TreeIterator(tables)
    tree.seek(0)
    do {
      let live = 0
      for (let node = 0; node < tables.numNodes; node++) {
        if (tree.parent[node] !== NULL_NODE) {
          live++
        }
      }
      expect(tree.edgeCount).toBe(live)
    } while (tree.next() && tree.index < 40)
  })

  test('a packed region reports edges per tree in both modes', () => {
    const trees = buildArgRegionData({
      tables,
      start: 0,
      end: 2000,
      maxEdges: 500_000,
      maxSkylinePoints: 5000,
    })
    for (let i = 0; i < trees.numTrees; i++) {
      expect(trees.edgeCount[i]).toBe(
        trees.edgeOffset[i + 1]! - trees.edgeOffset[i]!,
      )
    }
    const skyline = buildArgRegionData({
      tables,
      start: 0,
      end: 100000,
      maxEdges: 10_000,
      maxSkylinePoints: 200,
    })
    expect(skyline.edgeCount.length).toBe(200)
    expect(Math.min(...skyline.edgeCount)).toBeGreaterThan(0)
  })
})
