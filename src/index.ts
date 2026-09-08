import Plugin from '@jbrowse/core/Plugin'

import ArgAdapterF from './ArgAdapter/index.ts'
import ArgRPCF from './ArgRPC/index.ts'
import ArgTrackF from './ArgTrack/index.ts'
import LinearArgDisplayF from './LinearArgDisplay/index.ts'

import type PluginManager from '@jbrowse/core/PluginManager'

export default class ArgPlugin extends Plugin {
  name = 'ArgPlugin'

  install(pluginManager: PluginManager) {
    ArgAdapterF(pluginManager)
    ArgTrackF(pluginManager)
    ArgRPCF(pluginManager)
    LinearArgDisplayF(pluginManager)
  }
}

export { readKastore } from './tskit/kastore.ts'
export { readTreeSequenceTables } from './tskit/tables.ts'
export { TreeIterator, numTrees, treeBreakpoints } from './tskit/TreeIterator.ts'
export { buildArgRegionData } from './ArgRPC/buildArgRegionData.ts'
export type { TreeSequenceTables } from './tskit/tables.ts'
export type { ArgRegionData } from './ArgRPC/rpcTypes.ts'
