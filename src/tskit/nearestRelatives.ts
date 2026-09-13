import { NULL_NODE } from './TreeIterator.ts'

import type { TreeIterator } from './TreeIterator.ts'
import type { TreeSequenceTables } from './tables.ts'

/**
 * Who each sample's closest relatives are in one local tree, by population.
 *
 * A sample's relatives are the other samples under its first ancestor that has
 * any: the clade it joins first. Of those, the population most of them belong
 * to and the share they make up is what an ancestry painting colors a row by —
 * the per-tree form of tskit's genealogical nearest neighbours. A haplotype
 * that carries DNA from another population shows up as a run of trees where its
 * relatives are that population's samples.
 *
 * Populations are counted by rank among the ones that have samples, so the
 * counts per node stay as small as the populations actually present.
 */
export class NearestRelatives {
  /** per sample, in `samples` order: the relatives' population rank, or -1 */
  readonly population: Int16Array
  /** per sample: the share of relatives from that population, 0..1 */
  readonly share: Float32Array
  private readonly tables: TreeSequenceTables
  private readonly rankOfPopulation: Map<number, number>
  private readonly counts: Uint32Array
  private readonly below: Uint32Array
  private readonly preorder: Int32Array
  private readonly stack: Int32Array
  readonly numRanks: number

  constructor(tables: TreeSequenceTables) {
    this.tables = tables
    this.rankOfPopulation = new Map(
      tables.samplePopulations.map((id, rank) => [id, rank]),
    )
    this.numRanks = Math.max(1, tables.samplePopulations.length)
    this.counts = new Uint32Array(tables.numNodes * this.numRanks)
    this.below = new Uint32Array(tables.numNodes)
    this.preorder = new Int32Array(tables.numNodes)
    this.stack = new Int32Array(tables.numNodes)
    this.population = new Int16Array(tables.numSamples)
    this.share = new Float32Array(tables.numSamples)
  }

  compute(tree: TreeIterator) {
    const { samples, nodePopulation } = this.tables
    const { leftChild, rightSib, parent } = tree
    const { counts, below, preorder, stack, numRanks } = this
    let top = 0
    for (const root of tree.roots()) {
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
    for (let i = 0; i < count; i++) {
      const node = preorder[i]!
      below[node] = 0
      counts.fill(0, node * numRanks, (node + 1) * numRanks)
    }
    for (const sample of samples) {
      const rank = this.rankOfPopulation.get(nodePopulation[sample]!)
      below[sample] = 1
      if (rank !== undefined) {
        counts[sample * numRanks + rank] = 1
      }
    }
    for (let i = count - 1; i >= 0; i--) {
      const node = preorder[i]!
      const up = parent[node]!
      if (up !== NULL_NODE) {
        below[up]! += below[node]!
        for (let r = 0; r < numRanks; r++) {
          counts[up * numRanks + r]! += counts[node * numRanks + r]!
        }
      }
    }
    samples.forEach((sample, index) => {
      let ancestor = parent[sample]!
      while (ancestor !== NULL_NODE && below[ancestor]! < 2) {
        ancestor = parent[ancestor]!
      }
      if (ancestor === NULL_NODE) {
        this.population[index] = -1
        this.share[index] = 0
        return
      }
      const ownRank = this.rankOfPopulation.get(nodePopulation[sample]!)
      let best = -1
      let bestCount = 0
      for (let r = 0; r < numRanks; r++) {
        const relatives =
          counts[ancestor * numRanks + r]! - (r === ownRank ? 1 : 0)
        if (relatives > bestCount) {
          best = r
          bestCount = relatives
        }
      }
      this.population[index] = best
      this.share[index] = best < 0 ? 0 : bestCount / (below[ancestor]! - 1)
    })
  }
}
