import { populationColor } from '../LinearArgDisplay/components/palette.ts'
import { TreeIterator } from '../tskit/TreeIterator.ts'
import { NearestRelatives } from '../tskit/nearestRelatives.ts'

import type { TreeSequenceTables } from '../tskit/tables.ts'

/** share steps a run is split at, so a run is one color and one opacity */
const SHARE_STEPS = 4

export interface PaintingRun {
  /** the row: the sample's own population, then its name */
  row: string
  sample: string
  population: string
  relatives: string
  share: number
  start: number
  end: number
  color: string
}

function hexToRgba(hex: string, alpha: number) {
  const [r, g, b] = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16))
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`
}

export function populationLabel(tables: TreeSequenceTables, id: number) {
  return id < 0 ? 'unknown' : tables.populationNames[id] || `population ${id}`
}

/**
 * The ancestry painting of `[start, end)` as intervals: for each sample, runs of
 * consecutive local trees in which its nearest relatives are mostly the same
 * population at the same share. A painting rarely changes color, so a region of
 * thousands of trees comes out as a few runs per sample.
 */
export function paintingRuns(
  tables: TreeSequenceTables,
  start: number,
  end: number,
) {
  const { samples, nodePopulation, samplePopulations, sampleNames } = tables
  const relatives = new NearestRelatives(tables)
  const tree = new TreeIterator(tables)
  const open: (PaintingRun | undefined)[] = Array.from(samples, () => undefined)
  const runs: PaintingRun[] = []
  const rows = [...samples].map(
    (node, i) =>
      `${populationLabel(tables, nodePopulation[node]!)} ${sampleNames[i]}`,
  )
  tree.seek(start)
  for (;;) {
    const hasGenealogy = tree.edgeCount > 0
    if (hasGenealogy) {
      relatives.compute(tree)
    }
    for (let s = 0; s < samples.length; s++) {
      const rank = hasGenealogy ? relatives.population[s]! : -1
      const step = Math.round(relatives.share[s]! * SHARE_STEPS)
      const run = open[s]
      if (
        run &&
        rank >= 0 &&
        run.relatives === populationLabel(tables, samplePopulations[rank]!) &&
        Math.round(run.share * SHARE_STEPS) === step
      ) {
        run.end = tree.right
        continue
      }
      if (run) {
        runs.push(run)
        open[s] = undefined
      }
      if (rank >= 0) {
        const share = step / SHARE_STEPS
        open[s] = {
          row: rows[s]!,
          sample: sampleNames[s]!,
          population: populationLabel(tables, nodePopulation[samples[s]!]!),
          relatives: populationLabel(tables, samplePopulations[rank]!),
          share,
          start: tree.left,
          end: tree.right,
          color: hexToRgba(populationColor(rank), 0.2 + 0.8 * share),
        }
      }
    }
    if (tree.right >= end || !tree.next()) {
      break
    }
  }
  for (const run of open) {
    if (run) {
      runs.push(run)
    }
  }
  return runs
}
