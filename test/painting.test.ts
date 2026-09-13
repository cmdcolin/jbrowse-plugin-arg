import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { buildArgRegionData } from '../src/ArgRPC/buildArgRegionData.ts'
import { NULL_NODE, TreeIterator } from '../src/tskit/TreeIterator.ts'
import { NearestRelatives } from '../src/tskit/nearestRelatives.ts'
import { readTreeSequenceTables } from '../src/tskit/tables.ts'

import type { TreeSequenceTables } from '../src/tskit/tables.ts'

const file = fs.readFileSync(
  path.join(import.meta.dirname, '../test_data/small.trees'),
)
const single = readTreeSequenceTables(
  file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength,
  ) as ArrayBuffer,
)

// The fixture has one population; split its samples across three so there is
// something to tell apart, the way a real file's population column would.
function withPopulations(tables: TreeSequenceTables): TreeSequenceTables {
  const nodePopulation = tables.nodePopulation.slice()
  tables.samples.forEach((sample, index) => {
    nodePopulation[sample] = [4, 7, 9][index % 3]!
  })
  return { ...tables, nodePopulation, samplePopulations: [4, 7, 9] }
}
const tables = withPopulations(single)

// A second implementation that shares nothing with the first: walk every sample
// up to the root and collect, for each sample, the others that pass through its
// first ancestor with company.
function naive(tree: TreeIterator) {
  const { samples, nodePopulation, samplePopulations } = tables
  const lineage = (sample: number) => {
    const nodes = [sample]
    while (tree.parent[nodes.at(-1)!] !== NULL_NODE) {
      nodes.push(tree.parent[nodes.at(-1)!]!)
    }
    return nodes
  }
  const lineages = [...samples].map(lineage)
  return lineages.map((own, index) => {
    for (const ancestor of own.slice(1)) {
      const relatives = lineages.filter(
        (other, j) => j !== index && other.includes(ancestor),
      )
      if (relatives.length > 0) {
        const counts = samplePopulations.map(
          id =>
            relatives.filter(other => nodePopulation[other[0]!] === id).length,
        )
        const best = counts.indexOf(Math.max(...counts))
        return { population: best, share: counts[best]! / relatives.length }
      }
    }
    return { population: -1, share: 0 }
  })
}

describe('nearest relatives', () => {
  test.each([0, 500, 12345, 50000, 99999])(
    'at %i they match walking every lineage by hand',
    pos => {
      const tree = new TreeIterator(tables)
      tree.seek(pos)
      const relatives = new NearestRelatives(tables)
      relatives.compute(tree)
      const expected = naive(tree)
      expected.forEach(({ population, share }, index) => {
        expect(relatives.share[index]).toBeCloseTo(share, 5)
        // a tie can go either way; the share of the winner cannot
        if (share < 0.5) {
          return
        }
        expect(relatives.population[index]).toBe(population)
      })
    },
  )

  test('in a one-population file every relative is that population', () => {
    const tree = new TreeIterator(single)
    tree.seek(12345)
    const relatives = new NearestRelatives(single)
    relatives.compute(tree)
    expect([...relatives.population].every(p => p === 0)).toBe(true)
    expect([...relatives.share].every(s => s === 1)).toBe(true)
  })
})

describe('packing a painting', () => {
  const region = { tables, maxEdges: 500_000, maxSkylinePoints: 5000 }

  test('is sent only when asked for', () => {
    const plain = buildArgRegionData({ ...region, start: 0, end: 2000 })
    expect(plain.paintPopulation.length).toBe(0)
  })

  test('a tree column is that tree, one entry per sample', () => {
    const data = buildArgRegionData({
      ...region,
      start: 12345,
      end: 12346,
      painting: true,
    })
    const tree = new TreeIterator(tables)
    tree.seek(12345)
    const expected = naive(tree)
    expect(data.paintPopulation.length).toBe(tables.numSamples)
    expected.forEach(({ share }, index) => {
      expect(data.paintShare[index]).toBe(Math.round(share * 255))
    })
  })

  test('a skyline bin paints what most of its sequence says', () => {
    const data = buildArgRegionData({
      tables,
      start: 0,
      end: 100000,
      maxEdges: 10_000,
      maxSkylinePoints: 10,
      painting: true,
    })
    expect(data.detail).toBe('skyline')
    expect(data.paintPopulation.length).toBe(10 * tables.numSamples)
    expect([...data.paintPopulation].every(p => p >= 0 && p < 3)).toBe(true)
  })

  test('rows group samples by their own population', () => {
    const data = buildArgRegionData({ ...region, start: 0, end: 10 })
    const own = [...data.sampleRows].map(index =>
      tables.samplePopulations.indexOf(
        tables.nodePopulation[tables.samples[index]!]!,
      ),
    )
    expect(own).toEqual([...own].sort((a, b) => a - b))
    expect(new Set(data.sampleRows).size).toBe(tables.numSamples)
  })
})
