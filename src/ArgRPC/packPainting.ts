import { globalLeafRanks } from '../tskit/globalLeafOrder.ts'
import { NearestRelatives } from '../tskit/nearestRelatives.ts'

import type { TreeIterator } from '../tskit/TreeIterator.ts'
import type { TreeSequenceTables } from '../tskit/tables.ts'

const rowCache = new WeakMap<TreeSequenceTables, Int32Array>()

/**
 * The order an ancestry painting stacks its rows in: grouped by each sample's
 * own population, and within one by the global leaf order, so haplotypes that
 * sit together in the trees sit together in the painting.
 */
export function sampleRows(tables: TreeSequenceTables) {
  const cached = rowCache.get(tables)
  if (cached) {
    return cached
  }
  const ranks = globalLeafRanks(tables)
  const { samples, nodePopulation, samplePopulations } = tables
  const popRank = (index: number) =>
    samplePopulations.indexOf(nodePopulation[samples[index]!]!)
  const rows = Int32Array.from(samples.keys()).sort(
    (a, b) =>
      popRank(a) - popRank(b) || ranks[samples[a]!]! - ranks[samples[b]!]!,
  )
  rowCache.set(tables, rows)
  return rows
}

/**
 * Accumulates one painting column at a time: every tree added before a close
 * votes for its samples' relatives, weighted by the sequence it spans, so a
 * skyline bin paints what most of its sequence says rather than what its first
 * tree says.
 */
export class PaintingPacker {
  readonly population: Int16Array
  readonly share: Uint8Array
  private readonly relatives: NearestRelatives
  private readonly votes: Float32Array
  private readonly numSamples: number
  private span = 0

  constructor(tables: TreeSequenceTables, columns: number) {
    this.numSamples = tables.numSamples
    this.relatives = new NearestRelatives(tables)
    this.votes = new Float32Array(this.numSamples * this.relatives.numRanks)
    this.population = new Int16Array(columns * this.numSamples).fill(-1)
    this.share = new Uint8Array(columns * this.numSamples)
  }

  add(tree: TreeIterator) {
    const { relatives, votes, numSamples } = this
    const width = tree.right - tree.left
    relatives.compute(tree)
    for (let s = 0; s < numSamples; s++) {
      const rank = relatives.population[s]!
      if (rank >= 0) {
        votes[s * relatives.numRanks + rank]! += width * relatives.share[s]!
      }
    }
    this.span += width
  }

  close(column: number) {
    const { relatives, votes, numSamples, span } = this
    const numRanks = relatives.numRanks
    for (let s = 0; s < numSamples; s++) {
      let best = -1
      let bestVote = 0
      for (let r = 0; r < numRanks; r++) {
        if (votes[s * numRanks + r]! > bestVote) {
          best = r
          bestVote = votes[s * numRanks + r]!
        }
      }
      this.population[column * numSamples + s] = best
      this.share[column * numSamples + s] =
        span > 0 ? Math.round((255 * bestVote) / span) : 0
    }
    votes.fill(0)
    this.span = 0
  }
}
