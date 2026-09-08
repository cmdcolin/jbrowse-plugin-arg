import { observer } from 'mobx-react'

import type { LinearArgDisplayModel } from '../model.ts'

const PopulationLegend = observer(function PopulationLegend({
  model,
}: {
  model: LinearArgDisplayModel
}) {
  const { legend } = model
  return legend.length === 0 ? null : (
    <div
      style={{
        position: 'absolute',
        right: 4,
        top: 14,
        pointerEvents: 'none',
        background: 'rgba(255,255,255,0.82)',
        border: '1px solid #ddd',
        borderRadius: 3,
        padding: '2px 4px',
        fontSize: 9,
        lineHeight: '12px',
        color: '#333',
      }}
    >
      {legend.map(entry => (
        <div
          key={entry.id}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              background: entry.color,
              flexShrink: 0,
            }}
          />
          {entry.name}
        </div>
      ))}
    </div>
  )
})

export default PopulationLegend
