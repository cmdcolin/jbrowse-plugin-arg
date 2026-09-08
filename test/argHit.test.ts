import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { buildArgRegionData } from '../src/ArgRPC/buildArgRegionData.ts'
import { findArgHit } from '../src/LinearArgDisplay/components/findArgHit.ts'
import { timeToY } from '../src/LinearArgDisplay/components/timeAxis.ts'
import { NULL_NODE, TreeIterator } from '../src/tskit/TreeIterator.ts'
import { readTreeSequenceTables } from '../src/tskit/tables.ts'

import type { ArgRegionData } from '../src/ArgRPC/rpcTypes.ts'
import type { ArgRenderState } from '../src/LinearArgDisplay/components/argTypes.ts'
import type { RenderBlock } from '@jbrowse/render-core/renderBlock'

// One local tree of four leaves over 100..200bp, laid out the way
// LocalTreeLayout lays one out: leaves at (i + 0.5) / 4, an internal node
// centred between its first and last child. Edges in preorder from the root.
//
//        6 (t3, x .5)
//       /            \
//      4 (t1, x .25)  5 (t2, x .75)
//     / \            / \
//    0   1          2   3     (t0, x .125 .375 .625 .875)
function synthetic(): ArgRegionData {
  return {
    detail: 'trees',
    treeStart: new Float64Array([100]),
    treeEnd: new Float64Array([200]),
    tmrca: new Float32Array([3]),
    edgeCount: new Uint32Array([6]),
    edgeOffset: new Uint32Array([0, 6]),
    childX: new Float32Array([0.25, 0.125, 0.375, 0.75, 0.625, 0.875]),
    parentX: new Float32Array([0.5, 0.25, 0.25, 0.5, 0.75, 0.75]),
    childTime: new Float32Array([1, 0, 0, 2, 0, 0]),
    parentTime: new Float32Array([3, 1, 1, 3, 2, 2]),
    childNode: new Int32Array([4, 0, 1, 5, 2, 3]),
    parentNode: new Int32Array([6, 4, 4, 6, 5, 5]),
    edgePop: new Int32Array([0, 0, 0, 1, 1, 1]),
    numTrees: 1,
    treesInRegion: 1,
    maxNodeTime: 3,
    numSamples: 4,
    timeUnits: 'generations',
    populationNames: ['AFR', 'EUR'],
    samplePopulations: [0, 1],
  }
}

const block: RenderBlock = {
  displayedRegionIndex: 0,
  start: 100,
  end: 200,
  screenStartPx: 0,
  screenEndPx: 400,
  reversed: false,
}

const state: ArgRenderState = {
  canvasWidth: 400,
  canvasHeight: 100,
  maxTime: 3,
  timeScale: 'linear',
  branchColor: '#000',
  skylineColor: '#888',
  gridlineColor: '#eee',
  treeCellColor: '',
  populationColors: [],
  pxPerLeaf: 5,
  numSamples: 4,
}

function hit(x: number, y: number, data = synthetic(), where = block) {
  return findArgHit(x, y, [where], new Map([[0, data]]), state)
}

const y = (time: number) => timeToY(time, 3, 100, 'linear')

describe('hit testing a dendrogram', () => {
  test('the vertical limb of a branch', () => {
    // node 4 rises from t1 to t3 at x .25 of a 400px tree
    expect(hit(100, (y(1) + y(3)) / 2)?.branch).toEqual({
      node: 4,
      time: 1,
      leafCount: 2,
      populationName: 'AFR',
    })
  })

  test('the horizontal limb of a branch', () => {
    // node 4's elbow runs at t3 from x .25 across to its parent at x .5
    expect(hit(150, y(3))?.branch?.node).toBe(4)
  })

  test('a leaf reports one sample below it and its own population', () => {
    expect(hit(250, (y(0) + y(2)) / 2)?.branch).toEqual({
      node: 2,
      time: 0,
      leafCount: 1,
      populationName: 'EUR',
    })
  })

  test('the local tree interval comes along with the branch', () => {
    expect(hit(100, y(2))).toMatchObject({
      treeStart: 100,
      treeEnd: 200,
      tmrca: 3,
    })
  })

  test('empty space between branches hits nothing', () => {
    expect(hit(110, y(2))).toBeUndefined()
    expect(hit(200, y(1))).toBeUndefined()
  })

  test('the threshold is a few pixels, not none', () => {
    expect(hit(102, y(2))?.branch?.node).toBe(4)
    expect(hit(105, y(2))).toBeUndefined()
  })

  test('a reversed block draws the tree in the same pixels', () => {
    const reversed = { ...block, reversed: true }
    expect(hit(100, y(2), synthetic(), reversed)?.branch?.node).toBe(4)
  })

  test('a tree with no genealogy behind it draws nothing and hits nothing', () => {
    const empty = { ...synthetic(), edgeCount: new Uint32Array([0]) }
    expect(hit(100, y(2), empty)).toBeUndefined()
  })

  test('a tree too narrow for a dendrogram hits as its TMRCA', () => {
    // 4 leaves at 5px each needs 20px; this tree gets 4
    const narrow = { ...block, screenEndPx: 4 }
    expect(hit(2, y(3), synthetic(), narrow)).toEqual({
      treeStart: 100,
      treeEnd: 200,
      tmrca: 3,
      branch: undefined,
    })
  })
})

describe('hit testing a skyline', () => {
  const skyline: ArgRegionData = {
    ...synthetic(),
    detail: 'skyline',
    edgeOffset: new Uint32Array(0),
    childX: new Float32Array(0),
    parentX: new Float32Array(0),
    childTime: new Float32Array(0),
    parentTime: new Float32Array(0),
    childNode: new Int32Array(0),
    parentNode: new Int32Array(0),
    edgePop: new Int32Array(0),
  }

  test('reports the bin TMRCA rather than a branch', () => {
    expect(hit(200, y(3), skyline)).toEqual({
      treeStart: 100,
      treeEnd: 200,
      tmrca: 3,
      branch: undefined,
    })
  })

  test('away from the skyline it hits nothing', () => {
    expect(hit(200, y(1), skyline)).toBeUndefined()
  })
})

describe('hit testing a real tree sequence', () => {
  const file = fs.readFileSync(
    path.join(import.meta.dirname, '../test_data/small.trees'),
  )
  const tables = readTreeSequenceTables(
    file.buffer.slice(
      file.byteOffset,
      file.byteOffset + file.byteLength,
    ) as ArrayBuffer,
  )
  const data = buildArgRegionData({
    tables,
    start: 0,
    end: 1000,
    maxEdges: 100000,
    maxSkylinePoints: 100,
  })
  const realBlock: RenderBlock = {
    displayedRegionIndex: 0,
    start: 0,
    end: 1000,
    screenStartPx: 0,
    screenEndPx: 800,
    reversed: false,
  }
  const realState: ArgRenderState = {
    ...state,
    canvasWidth: 800,
    maxTime: tables.maxNodeTime,
    timeScale: 'log',
    pxPerLeaf: 1,
    numSamples: tables.numSamples,
  }
  const regions = new Map([[0, data]])
  const toY = (time: number) =>
    timeToY(time, realState.maxTime, realState.canvasHeight, 'log')

  // The renderer's own placement, restated so a change to either side shows up
  // as a disagreement here rather than as a tooltip that is quietly off.
  function drawn(tree: number, edge: number) {
    const toPx = (bp: number) => (bp / 1000) * 800
    const left = toPx(data.treeStart[tree]!)
    const width = toPx(data.treeEnd[tree]!) - left
    return {
      childX: left + data.childX[edge]! * width,
      parentX: left + data.parentX[edge]! * width,
      childY: toY(data.childTime[edge]!),
      parentY: toY(data.parentTime[edge]!),
    }
  }

  function edgeOf(tree: number, node: number) {
    const to = data.edgeOffset[tree + 1]!
    let found = -1
    for (let j = data.edgeOffset[tree]!; j < to; j++) {
      if (data.childNode[j] === node) {
        found = j
      }
    }
    return found
  }

  test('the region came back as trees', () => {
    expect(data.detail).toBe('trees')
    expect(data.numTrees).toBeGreaterThan(1)
  })

  test('every branch is found under the pixel it was drawn at', () => {
    const tree = Math.floor(data.numTrees / 2)
    const to = data.edgeOffset[tree + 1]!
    expect(to).toBeGreaterThan(data.edgeOffset[tree]!)
    for (let j = data.edgeOffset[tree]!; j < to; j++) {
      const limb = drawn(tree, j)
      const found = findArgHit(
        limb.childX,
        (limb.childY + limb.parentY) / 2,
        [realBlock],
        regions,
        realState,
      )
      // Branches overlap at this width, so the answer is whichever elbow the
      // query point is on — not necessarily edge j, but never one elsewhere.
      const node = found?.branch?.node
      expect(node).toBeDefined()
      const other = drawn(tree, edgeOf(tree, node!))
      expect(other.childX).toBeCloseTo(limb.childX, 6)
    }
  })

  test('a hit names the local tree it was drawn in', () => {
    const tree = Math.floor(data.numTrees / 2)
    const limb = drawn(tree, data.edgeOffset[tree]!)
    const found = findArgHit(
      limb.childX,
      (limb.childY + limb.parentY) / 2,
      [realBlock],
      regions,
      realState,
    )
    expect(found?.treeStart).toBe(data.treeStart[tree])
    expect(found?.treeEnd).toBe(data.treeEnd[tree])
  })

  test('the leaf count matches walking the tree up from every sample', () => {
    const tree = Math.floor(data.numTrees / 2)
    const iterator = new TreeIterator(tables)
    iterator.seek(data.treeStart[tree]!)
    const samplesBelow = new Int32Array(tables.numNodes)
    for (const sample of tables.samples) {
      let node = sample
      samplesBelow[node]! += 1
      while (iterator.parent[node] !== NULL_NODE) {
        node = iterator.parent[node]!
        samplesBelow[node]! += 1
      }
    }
    const to = data.edgeOffset[tree + 1]!
    for (let j = data.edgeOffset[tree]!; j < to; j++) {
      const limb = drawn(tree, j)
      const found = findArgHit(
        limb.childX,
        (limb.childY + limb.parentY) / 2,
        [realBlock],
        regions,
        realState,
      )
      const node = found?.branch?.node
      expect(node).toBeDefined()
      expect(found?.branch?.leafCount).toBe(samplesBelow[node!])
    }
  })

  test('a cursor above the deepest root hits nothing', () => {
    expect(
      findArgHit(
        400,
        toY(realState.maxTime) - 20,
        [realBlock],
        regions,
        realState,
      ),
    ).toBeUndefined()
  })
})
