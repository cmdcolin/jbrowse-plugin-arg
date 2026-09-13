import { observer } from 'mobx-react'

import type { LinearArgDisplayModel } from '../model.ts'

const MIN_ROW_PX = 9

/**
 * Each painting row's haplotype, with a swatch of its own population: the
 * painting colors a row by its relatives, so the row's own color is the one
 * thing the cells cannot say.
 */
const PaintingRowLabels = observer(function PaintingRowLabels({
  model,
}: {
  model: LinearArgDisplayModel
}) {
  const { height, numSamples, sampleRows, sampleNames, samplePopulation } =
    model
  const rowHeight = height / Math.max(1, numSamples)
  return rowHeight < MIN_ROW_PX ? null : (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        pointerEvents: 'none',
        fontSize: Math.min(10, rowHeight - 1),
        lineHeight: `${rowHeight}px`,
        color: '#222',
      }}
    >
      {[...sampleRows].map((sample, row) => (
        <div
          key={sample}
          style={{
            position: 'absolute',
            top: row * rowHeight,
            left: 0,
            height: rowHeight,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            paddingRight: 3,
            background: 'rgba(255,255,255,0.7)',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: 6,
              height: rowHeight,
              background:
                model.populationColors[samplePopulation[sample]!] ?? '#999',
            }}
          />
          {sampleNames[sample]}
        </div>
      ))}
    </div>
  )
})

export default PaintingRowLabels
