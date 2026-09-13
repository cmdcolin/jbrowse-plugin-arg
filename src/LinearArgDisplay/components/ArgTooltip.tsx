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
  if (hoveredFeature === undefined || mouseState === undefined) {
    return null
  }
  const { branch, mutation, painting } = hoveredFeature
  // on the right half the card hangs left of the cursor, off the clade the
  // hover just drew bold beneath it
  const flip = mouseState.x > model.canvasWidthPx / 2
  return (
    <>
      {mutation === undefined ? null : (
        // down to the site's own column, which is where a genotype track below
        // shows the same variant
        <div
          data-testid="arg-mutation-guide"
          style={{
            position: 'absolute',
            left: mutation.siteX,
            top: 0,
            bottom: 0,
            borderLeft: '1px dashed #111',
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          left: flip ? mouseState.x - OFFSET_PX : mouseState.x + OFFSET_PX,
          top: mouseState.y + OFFSET_PX,
          transform: flip ? 'translateX(-100%)' : undefined,
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
        {mutation === undefined ? null : (
          <>
            <div>
              <b>mutation {mutation.allele}</b> at{' '}
              {count(Math.round(mutation.position))}
            </div>
            <div>
              {mutation.time === undefined
                ? 'time not recorded'
                : `time ${time(mutation.time)}${units}`}
            </div>
          </>
        )}
        {painting !== undefined ? (
          <>
            <div>
              <b>{painting.sampleName}</b>
              {painting.population ? `, ${painting.population}` : ''}
            </div>
            <div>
              {painting.relatives === undefined
                ? 'no relatives in this tree'
                : `nearest relatives ${Math.round(painting.share * 100)}% ${painting.relatives}`}
            </div>
          </>
        ) : branch === undefined ? (
          <div>
            TMRCA {time(hoveredFeature.tmrca)}
            {units}
          </div>
        ) : (
          <>
            <div>node {branch.node}</div>
            {mutation === undefined ? (
              <div>
                time {time(branch.time)}
                {units}
              </div>
            ) : null}
            <div>
              {count(branch.leafCount)}{' '}
              {branch.leafCount === 1 ? 'sample' : 'samples'} below
            </div>
            {branch.populationName === undefined ? null : (
              <div>{branch.populationName}</div>
            )}
          </>
        )}
        <div>
          tree {count(Math.round(hoveredFeature.treeStart))}..
          {count(Math.round(hoveredFeature.treeEnd))}
        </div>
        {hoveredFeature.treesInCell > 1 ? (
          <div>
            standing in for {count(hoveredFeature.treesInCell)} trees here
          </div>
        ) : null}
      </div>
    </>
  )
})

export default ArgTooltip
