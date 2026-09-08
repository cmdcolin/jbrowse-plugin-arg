import { lazy } from 'react'

import { DisplayType } from '@jbrowse/core/pluggableElementTypes'

import { configSchema } from './configSchema.ts'
import { modelFactory } from './model.ts'

import type PluginManager from '@jbrowse/core/PluginManager'

const ArgDisplayComponent = lazy(
  () => import('./components/ArgDisplayComponent.tsx'),
)

export default function LinearArgDisplayF(pluginManager: PluginManager) {
  pluginManager.addDisplayType(
    () =>
      new DisplayType({
        name: 'LinearArgDisplay',
        configSchema,
        stateModel: modelFactory(configSchema),
        displayName: 'ARG local trees',
        trackType: 'ArgTrack',
        viewType: 'LinearGenomeView',
        ReactComponent: ArgDisplayComponent,
      }),
  )
}
