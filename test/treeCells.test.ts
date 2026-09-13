import { describe, expect, test } from 'vitest'

import { findArgHit } from '../src/LinearArgDisplay/components/findArgHit.ts'
import { timeToY } from '../src/LinearArgDisplay/components/timeAxis.ts'
import { layoutTreeCells } from '../src/LinearArgDisplay/components/treeCells.ts'

import type { ArgRegionData } from '../src/ArgRPC/rpcTypes.ts'
import type { ArgRenderState } from '../src/LinearArgDisplay/components/argTypes.ts'
import type { RenderBlock } from '@jbrowse/render-core/renderBlock'

// Every tree is the same four-leaf tree over its own interval:
//
//        6 (t3)
//       /      \
//      4 (t1)   5 (t2)
//     / \      / \
//    0   1    2   3
function trees(
  intervals: [number, number][],
  detail: ArgRegionData['detail'] = 'trees',
): ArgRegionData {
  const n = intervals.length
  const repeat = <T extends Float32Array | Int32Array>(
    Type: new (values: number[]) => T,
    values: number[],
  ) => new Type(intervals.flatMap(() => values))
  return {
    detail,
    treeStart: Float64Array.from(intervals.map(([start]) => start)),
    treeEnd: Float64Array.from(intervals.map(([, end]) => end)),
    tmrca: new Float32Array(n).fill(3),
    edgeCount: new Uint32Array(n).fill(6),
    edgeOffset: Uint32Array.from({ length: n + 1 }, (_, i) => i * 6),
    childX: repeat(Float32Array, [0.25, 0.125, 0.375, 0.75, 0.625, 0.875]),
    parentX: repeat(Float32Array, [0.5, 0.25, 0.25, 0.5, 0.75, 0.75]),
    childTime: repeat(Float32Array, [1, 0, 0, 2, 0, 0]),
    parentTime: repeat(Float32Array, [3, 1, 1, 3, 2, 2]),
    childNode: repeat(Int32Array, [4, 0, 1, 5, 2, 3]),
    parentNode: repeat(Int32Array, [6, 4, 4, 6, 5, 5]),
    edgePop: repeat(Int32Array, [0, 0, 0, 1, 1, 1]),
    mutationEdge: new Int32Array(0),
    mutationTime: new Float32Array(0),
    mutationPosition: new Float64Array(0),
    mutationAllele: [],
    numTrees: n,
    treesInRegion: n,
    maxNodeTime: 3,
    numSamples: 4,
    timeUnits: 'generations',
    populationNames: ['AFR', 'EUR'],
    samplePopulations: [0, 1],
  }
}

describe('laying trees out into cells', () => {
  test('a tree as wide as a column gets a cell of its own', () => {
    const { cells, collapsed } = layoutTreeCells(trees([[0, 100]]), 100)
    expect(cells).toEqual([{ tree: 0, start: 0, end: 100, count: 1 }])
    expect(collapsed).toEqual([])
  })

  test('narrow trees in one column draw the one spanning the most sequence', () => {
    const { cells } = layoutTreeCells(
      trees([
        [0, 20],
        [20, 70],
        [70, 100],
      ]),
      100,
    )
    expect(cells).toEqual([{ tree: 1, start: 0, end: 100, count: 3 }])
  })

  test('columns follow the genome, not the order trees arrive in', () => {
    const { cells } = layoutTreeCells(
      trees([
        [0, 40],
        [40, 90],
        [90, 140],
        [140, 200],
      ]),
      100,
    )
    expect(cells.map(cell => [cell.start, cell.end, cell.count])).toEqual([
      [0, 90, 2],
      [90, 200, 2],
    ])
  })

  test('a column of more than four trees is a skyline, not a sample', () => {
    const { cells, collapsed } = layoutTreeCells(
      trees([
        [0, 20],
        [20, 40],
        [40, 60],
        [60, 80],
        [80, 100],
      ]),
      100,
    )
    expect(cells).toEqual([])
    expect(collapsed).toEqual([0, 1, 2, 3, 4])
  })

  test('a sliver narrower than half a column collapses', () => {
    const { cells, collapsed } = layoutTreeCells(
      trees([
        [0, 100],
        [100, 130],
        [130, 230],
      ]),
      100,
    )
    expect(cells.map(cell => cell.tree)).toEqual([0, 2])
    expect(collapsed).toEqual([1])
  })

  test('a stretch with no genealogy splits a column and draws nothing', () => {
    const data = trees([
      [0, 20],
      [20, 30],
      [30, 60],
    ])
    data.edgeCount[1] = 0
    const { cells, collapsed } = layoutTreeCells(data, 60)
    expect(cells).toEqual([{ tree: 2, start: 30, end: 60, count: 1 }])
    expect(collapsed).toEqual([0])
  })

  test('a skyline payload never draws a tree', () => {
    const { cells, collapsed } = layoutTreeCells(
      trees([[0, 1000]], 'skyline'),
      100,
    )
    expect(cells).toEqual([])
    expect(collapsed).toEqual([0])
  })
})

describe('hovering a sampled cell', () => {
  // 4 leaves at 5px each needs a 20px column; at 1bp per px three trees share
  // the column 0..20 and the 8bp one among them is drawn across it
  const data = trees([
    [0, 6],
    [6, 14],
    [14, 20],
  ])
  const block: RenderBlock = {
    displayedRegionIndex: 0,
    start: 0,
    end: 100,
    screenStartPx: 0,
    screenEndPx: 100,
    reversed: false,
  }
  const state: ArgRenderState = {
    canvasWidth: 100,
    canvasHeight: 100,
    maxTime: 3,
    timeScale: 'linear',
    branchColor: '#000',
    skylineColor: '#888',
    gridlineColor: '#eee',
    treeCellColor: '',
    sampleSpanColor: '#888',
    populationColors: [],
    pxPerLeaf: 5,
    numSamples: 4,
    showMutations: true,
    mutationColor: '#111',
    highlightSamples: [],
    highlightColor: '#f00',
    hoveredClade: undefined,
  }
  const y = (time: number) => timeToY(time, 3, 100, 'linear')
  const hit = (x: number, time: number) =>
    findArgHit(x, y(time), [block], new Map([[0, data]]), state)

  test('reports the tree drawn and how many it stands for', () => {
    // leaf 0 sits at 0.125 of the 20px cell
    expect(hit(2.5, 0.5)).toMatchObject({
      treeStart: 6,
      treeEnd: 14,
      treesInCell: 3,
      branch: { node: 0 },
    })
  })

  test('a mutation is found on its branch, and names its site', () => {
    // on tree 1's leaf 0 (edge 7), at site 10 with an unknown time, so drawn
    // halfway up the leaf's branch from t0 to t1
    const mutated = {
      ...data,
      mutationEdge: new Int32Array([7]),
      mutationTime: new Float32Array([Number.NaN]),
      mutationPosition: new Float64Array([10]),
      mutationAllele: ['G>A'],
    }
    const found = findArgHit(
      2.5,
      (y(0) + y(1)) / 2,
      [block],
      new Map([[0, mutated]]),
      state,
    )
    expect(found).toMatchObject({
      branch: { node: 0 },
      mutation: { position: 10, allele: 'G>A', time: undefined, siteX: 10 },
    })
  })

  test('a mutation with a known time is drawn at it', () => {
    const mutated = {
      ...data,
      mutationEdge: new Int32Array([7]),
      mutationTime: new Float32Array([0.25]),
      mutationPosition: new Float64Array([10]),
      mutationAllele: ['G>A'],
    }
    const at = (time: number) =>
      findArgHit(2.5, y(time), [block], new Map([[0, mutated]]), state)
    expect(at(0.25)?.mutation?.time).toBe(0.25)
    expect(at(0.75)?.mutation).toBeUndefined()
  })

  test('branches are found across the cell, not the tree interval', () => {
    // leaf 3 at 0.875 of 20px lies beyond the drawn tree's own 14bp end
    expect(hit(17.5, 0.5)).toMatchObject({ branch: { node: 3 } })
  })
})
