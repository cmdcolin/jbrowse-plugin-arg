import { TrackType } from '@jbrowse/core/pluggableElementTypes'
import { createBaseTrackModel } from '@jbrowse/core/pluggableElementTypes/models'

import configSchemaF from './configSchema.ts'

import type PluginManager from '@jbrowse/core/PluginManager'

export default function ArgTrackF(pluginManager: PluginManager) {
  pluginManager.addTrackType(() => {
    const configSchema = configSchemaF(pluginManager)
    return new TrackType({
      name: 'ArgTrack',
      displayName: 'ARG track',
      configSchema,
      stateModel: createBaseTrackModel(pluginManager, 'ArgTrack', configSchema),
    })
  })
}
