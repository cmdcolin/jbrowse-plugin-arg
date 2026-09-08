import DisplayChrome from '@jbrowse/display-kit/DisplayChrome'
import { observer } from 'mobx-react'

import ArgTooltip from './ArgTooltip.tsx'
import { ArgRenderer } from './Canvas2DArgRenderer.ts'
import PopulationLegend from './PopulationLegend.tsx'
import TimeAxisLabels from './TimeAxisLabels.tsx'

import type { LinearArgDisplayModel } from '../model.ts'
import type { MouseTracker } from '@jbrowse/core/ui'

const ArgDisplayComponent = observer(function ArgDisplayComponent({
  model,
}: {
  model: LinearArgDisplayModel
}) {
  return (
    <DisplayChrome
      model={model}
      factory={ArgRenderer}
      testid="arg-display"
      style={{ width: '100%', height: model.height }}
      // The chrome measures against its own container, which the body below
      // fills exactly, so this lands in the canvas' coordinate space untouched.
      onPointerPosition={state => {
        model.setHoveredFeature(
          state === undefined ? undefined : model.argHitAt(state.x, state.y),
        )
      }}
    >
      {({ canvasRef, mouseTracker }) => (
        <ArgBody
          model={model}
          canvasRef={canvasRef}
          mouseTracker={mouseTracker}
        />
      )}
    </DisplayChrome>
  )
})

const ArgBody = observer(function ArgBody({
  model,
  canvasRef,
  mouseTracker,
}: {
  model: LinearArgDisplayModel
  canvasRef: React.Ref<HTMLCanvasElement>
  mouseTracker: MouseTracker
}) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      <TimeAxisLabels model={model} />
      <PopulationLegend model={model} />
      <ArgTooltip model={model} mouseTracker={mouseTracker} />
    </div>
  )
})

export default ArgDisplayComponent
