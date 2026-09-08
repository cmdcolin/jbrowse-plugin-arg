import DisplayChrome from '@jbrowse/display-kit/DisplayChrome'
import { observer } from 'mobx-react'

import { ArgRenderer } from './Canvas2DArgRenderer.ts'
import PopulationLegend from './PopulationLegend.tsx'
import TimeAxisLabels from './TimeAxisLabels.tsx'

import type { LinearArgDisplayModel } from '../model.ts'

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
    >
      {({ canvasRef }) => <ArgBody model={model} canvasRef={canvasRef} />}
    </DisplayChrome>
  )
})

const ArgBody = observer(function ArgBody({
  model,
  canvasRef,
}: {
  model: LinearArgDisplayModel
  canvasRef: React.Ref<HTMLCanvasElement>
}) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      <TimeAxisLabels model={model} />
      <PopulationLegend model={model} />
    </div>
  )
})

export default ArgDisplayComponent
