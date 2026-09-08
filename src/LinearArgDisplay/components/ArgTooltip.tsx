import { useMouseState } from '@jbrowse/core/ui/useMouseTracking'
import { observer } from 'mobx-react'

import type { LinearArgDisplayModel } from '../model.ts'
import type { MouseTracker } from '@jbrowse/core/ui/useMouseTracking'

const OFFSET_PX = 12

function count(value: number) {
  return value.toLocaleString()
}

function time(value: number) {
  return Number(value.toPrecision(4)).toLocaleString()
}

const ArgTooltip = observer(function ArgTooltip({
  model,
  mouseTracker,
}: {
  model: LinearArgDisplayModel
  mouseTracker: MouseTracker
}) {
  const { hoveredFeature, timeUnits } = model
  const mouseState = useMouseState(mouseTracker)
  const units =
    timeUnits === 'unknown' || timeUnits === '' ? '' : ` ${timeUnits}`
  return hoveredFeature === undefined || mouseState === undefined ? null : (
    <div
      style={{
        position: 'absolute',
        left: mouseState.x + OFFSET_PX,
        top: mouseState.y + OFFSET_PX,
        pointerEvents: 'none',
        background: 'rgba(255,255,255,0.92)',
        border: '1px solid #ccc',
        borderRadius: 3,
        padding: '2px 5px',
        fontSize: 10,
        lineHeight: '13px',
        color: '#222',
        whiteSpace: 'nowrap',
        zIndex: 1,
      }}
    >
      {hoveredFeature.branch === undefined ? (
        <div>
          TMRCA {time(hoveredFeature.tmrca)}
          {units}
        </div>
      ) : (
        <>
          <div>node {hoveredFeature.branch.node}</div>
          <div>
            time {time(hoveredFeature.branch.time)}
            {units}
          </div>
          <div>
            {count(hoveredFeature.branch.leafCount)}{' '}
            {hoveredFeature.branch.leafCount === 1 ? 'sample' : 'samples'} below
          </div>
          {hoveredFeature.branch.populationName === undefined ? null : (
            <div>{hoveredFeature.branch.populationName}</div>
          )}
        </>
      )}
      <div>
        tree {count(Math.round(hoveredFeature.treeStart))}..
        {count(Math.round(hoveredFeature.treeEnd))}
      </div>
    </div>
  )
})

export default ArgTooltip
