import ArgGetRegion from './ArgGetRegion.ts'

import type PluginManager from '@jbrowse/core/PluginManager'

export default function ArgRPCF(pluginManager: PluginManager) {
  pluginManager.addRpcMethod(() => new ArgGetRegion(pluginManager))
}
