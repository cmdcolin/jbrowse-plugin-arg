import { observer } from 'mobx-react'

import { timeAxisTicks } from './timeAxis.ts'

import type { LinearArgDisplayModel } from '../model.ts'

const TimeAxisLabels = observer(function TimeAxisLabels({
  model,
}: {
  model: LinearArgDisplayModel
}) {
  const { maxTime, height, timeUnits } = model
  const ticks = timeAxisTicks(maxTime, height, model.renderState.timeScale)
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        right: 0,
        pointerEvents: 'none',
        fontSize: 9,
        color: '#666',
      }}
    >
      <div style={{ position: 'absolute', right: 4, top: 1 }}>{timeUnits}</div>
      {ticks.map(tick => (
        <div
          key={tick.time}
          style={{
            position: 'absolute',
            left: 2,
            top: tick.y - 10,
            background: 'rgba(255,255,255,0.75)',
            padding: '0 2px',
            whiteSpace: 'nowrap',
          }}
        >
          {tick.label}
        </div>
      ))}
    </div>
  )
})

export default TimeAxisLabels
