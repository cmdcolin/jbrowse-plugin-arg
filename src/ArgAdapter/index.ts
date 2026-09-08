import { AdapterType } from '@jbrowse/core/pluggableElementTypes'

import configSchema from './configSchema.ts'

import type PluginManager from '@jbrowse/core/PluginManager'

export default function ArgAdapterF(pluginManager: PluginManager) {
  pluginManager.addAdapterType(
    () =>
      new AdapterType({
        name: 'ArgAdapter',
        displayName: 'Tree sequence adapter (.trees)',
        configSchema,
        getAdapterClass: () => import('./ArgAdapter.ts').then(m => m.default),
      }),
  )
}
