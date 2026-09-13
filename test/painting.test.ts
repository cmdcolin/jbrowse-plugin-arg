import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { paintingRuns } from '../src/ArgAdapter/paintingFeatures.ts'
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

describe('painting runs', () => {
  const runs = paintingRuns(tables, 0, 20000)

  test("each sample's runs tile the region without overlap", () => {
    for (const name of tables.sampleNames) {
      const own = runs
        .filter(run => run.sample === name)
        .sort((a, b) => a.start - b.start)
      expect(own[0]!.start).toBe(0)
      for (let i = 1; i < own.length; i++) {
        expect(own[i]!.start).toBe(own[i - 1]!.end)
      }
      expect(own.at(-1)!.end).toBeGreaterThanOrEqual(20000)
    }
  })

  test('a run carries what its trees say about that sample', () => {
    const relatives = new NearestRelatives(tables)
    const tree = new TreeIterator(tables)
    for (const run of runs.slice(0, 200)) {
      tree.seek(run.start)
      relatives.compute(tree)
      const index = tables.sampleNames.indexOf(run.sample)
      const rank = relatives.population[index]!
      expect(run.relatives).toBe(
        tables.populationNames[tables.samplePopulations[rank]!] ||
          `population ${tables.samplePopulations[rank]}`,
      )
      expect(run.share).toBe(Math.round(relatives.share[index]! * 4) / 4)
    }
  })

  test('neighbouring runs of one sample always differ', () => {
    const bySample = new Map<string, typeof runs>()
    for (const run of runs) {
      bySample.set(run.sample, [...(bySample.get(run.sample) ?? []), run])
    }
    for (const own of bySample.values()) {
      own.sort((a, b) => a.start - b.start)
      for (let i = 1; i < own.length; i++) {
        const same =
          own[i]!.relatives === own[i - 1]!.relatives &&
          own[i]!.share === own[i - 1]!.share
        expect(same).toBe(false)
      }
    }
  })

  test("rows lead with the sample's own population", () => {
    expect(
      runs.every(run => run.row === `${run.population} ${run.sample}`),
    ).toBe(true)
  })
})
