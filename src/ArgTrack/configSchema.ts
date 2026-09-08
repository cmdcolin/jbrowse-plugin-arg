import { ConfigurationSchema } from '@jbrowse/core/configuration'
import { createBaseTrackConfig } from '@jbrowse/core/pluggableElementTypes/models'

import type PluginManager from '@jbrowse/core/PluginManager'

/**
 * #config ArgTrack
 */
export default function ArgTrackConfigSchemaF(pluginManager: PluginManager) {
  return ConfigurationSchema(
    'ArgTrack',
    {},
    {
      baseConfiguration: createBaseTrackConfig(pluginManager),
      explicitIdentifier: 'trackId',
    },
  )
}
